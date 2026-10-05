#!/usr/bin/env python3
"""
render_prefab.py — offline renders of Valheim assets, straight from the game
files. No game launch, no world load, no GPU.

Everything is read out of the installed game's asset bundles with UnityPy and
rasterised in numpy, so it runs anywhere Python does and is safe to call from a
build step.

    # one prefab
    python scripts/render_prefab.py --prefab Assets/world/Locations/Meadows/StartTemple.prefab \\
        --out web/public/img/render/starttemple.png

    # a single mesh by name, bigger, turned around
    python scripts/render_prefab.py --mesh CircleStone --out stone.png --size 768 --yaw 30 --pitch 35

    # several in one go — the bundles load once, which is the slow part
    python scripts/render_prefab.py --job CircleStone=stone.png --job Vegvisir=vegvisir.png

    # find out what is in there
    python scripts/render_prefab.py --list circlestone
    python scripts/render_prefab.py --list-prefabs starttemple

Options worth knowing:
    --size N        output square size (default 512)
    --yaw/--pitch   orbit around the asset in degrees (default 35 / 25)
    --bg            'none' for transparency (default) or a #rrggbb
    --no-texture    flat clay shading instead of the game's albedo
    --scale-hint    grow/shrink the framing, 1.0 fills the frame

Adding a new asset is usually a one-liner: find its name with --list, then
render it. The renderer handles nested prefab hierarchies, per-object
transforms, submeshes and albedo textures.
"""
from __future__ import annotations

import argparse
import math
import os
import re
import sys

import numpy as np
from PIL import Image

try:
    import UnityPy
except ImportError:  # pragma: no cover
    sys.exit("UnityPy is required:  pip install UnityPy")

DEFAULT_BUNDLES = (
    r"C:\Program Files (x86)\Steam\steamapps\common\Valheim\Valheim_Data\StreamingAssets\SoftRef"
)
SUPERSAMPLE = 3          # rendered at N x then downsampled; cheap antialiasing
LIGHT_DIR = np.array([-0.45, 0.80, -0.40])
AMBIENT = 0.34


# ── asset access ──────────────────────────────────────────────────────

_ENV = None


def load_env(path: str):
    """Load the bundles once. This is the slow step (tens of seconds)."""
    global _ENV
    if _ENV is None:
        if not os.path.exists(path):
            sys.exit(f"bundle path not found: {path}\nPass --bundles to point at your install.")
        print(f"loading bundles from {path} ...", file=sys.stderr)
        _ENV = UnityPy.load(path)
    return _ENV


def quat_to_matrix(q) -> np.ndarray:
    x, y, z, w = q["x"], q["y"], q["z"], q["w"]
    n = math.sqrt(x * x + y * y + z * z + w * w) or 1.0
    x, y, z, w = x / n, y / n, z / n, w / n
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w),     2 * (x * z + y * w)],
        [2 * (x * y + z * w),     1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w),     2 * (y * z + x * w),     1 - 2 * (x * x + y * y)],
    ])


def trs(tt) -> np.ndarray:
    """4x4 from a Transform's typetree (local position/rotation/scale)."""
    p = tt.get("m_LocalPosition", {"x": 0, "y": 0, "z": 0})
    r = tt.get("m_LocalRotation", {"x": 0, "y": 0, "z": 0, "w": 1})
    s = tt.get("m_LocalScale", {"x": 1, "y": 1, "z": 1})
    m = np.eye(4)
    m[:3, :3] = quat_to_matrix(r) @ np.diag([s["x"], s["y"], s["z"]])
    m[:3, 3] = [p["x"], p["y"], p["z"]]
    return m


def _components(go):
    for c in getattr(go, "m_Components", []) or []:
        try:
            yield c.deref()
        except Exception:
            continue


def _first(go, type_name):
    for r in _components(go):
        if r.type.name == type_name:
            return r
    return None


_TEX_SLOTS = {
    "base": ("_MainTex", "_BaseMap", "_Albedo"),
    # Valheim paints moss on upward faces and carves the boss runes as an
    # emissive layer, so the base albedo alone renders a blank grey rock.
    "moss": ("_MossTex",),
    "emissive": ("_EmissiveTex", "_EmissionMap"),
    # The carved relief — rune grooves, chisel marks, pitted rock — lives
    # entirely in the normal map. Without it a Valheim stone renders as a flat
    # decal on a smooth surface.
    "bump": ("_BumpMap", "_NormalMap"),
}


def _decode_normal(t):
    """Tangent-space normal from a Unity normal map, RGB or DXT5nm.

    Unity's "Normal map" import swizzles x into alpha and leaves red at 1, so a
    straight RGB read gives a nearly flat surface. Detect that by the dead red
    channel rather than trusting the file name."""
    if t.shape[-1] == 4 and float(t[..., 0].min()) > 0.95:
        x = t[..., 3] * 2.0 - 1.0
        y = t[..., 1] * 2.0 - 1.0
    else:
        x = t[..., 0] * 2.0 - 1.0
        y = t[..., 1] * 2.0 - 1.0
    z = np.sqrt(np.clip(1.0 - x * x - y * y, 0.0, 1.0))
    return np.stack([x, y, z], axis=-1)


def _tangent_frame(p, uv):
    """(tangent, bitangent) for one triangle, or None for a degenerate UV."""
    e1 = p[1] - p[0]
    e2 = p[2] - p[0]
    du1, dv1 = uv[1][0] - uv[0][0], uv[1][1] - uv[0][1]
    du2, dv2 = uv[2][0] - uv[0][0], uv[2][1] - uv[0][1]
    det = du1 * dv2 - du2 * dv1
    if abs(det) < 1e-12:
        return None
    tan = (e1 * dv2 - e2 * dv1) / det
    bit = (e2 * du1 - e1 * du2) / det
    # sample() reads V flipped, so the bitangent points the other way.
    return tan, -bit


def _texture(env, pid):
    for t in env.objects:
        if t.path_id == pid and t.type.name == "Texture2D":
            try:
                return t.read().image.convert("RGBA")
            except Exception:
                return None
    return None


def _scale_offset(texenv):
    """(scale, offset) for one texture slot, defaulting to an untiled 1:1 map."""
    sc = (texenv or {}).get("m_Scale") or {}
    of = (texenv or {}).get("m_Offset") or {}
    return ((float(sc.get("x", 1.0)), float(sc.get("y", 1.0))),
            (float(of.get("x", 0.0)), float(of.get("y", 0.0))))


def materials_of(renderer_reader):
    """[{base, moss, emissive}] — one entry per material slot on the renderer."""
    out = []
    try:
        tt = renderer_reader.read_typetree()
        env = _ENV
        for mref in (tt.get("m_Materials") or []):
            pid = mref.get("m_PathID")
            slot = {"base": None, "moss": None, "emissive": None,
                    "st": {}, "moss_alpha": 1.0, "moss_edge": 0.4}
            for o in env.objects:
                if o.path_id != pid or o.type.name != "Material":
                    continue
                mt = o.read_typetree()
                props = mt.get("m_SavedProperties", {})
                envs = dict(props.get("m_TexEnvs") or [])
                for key, names in _TEX_SLOTS.items():
                    for n in names:
                        v = envs.get(n)
                        tex_pid = (v or {}).get("m_Texture", {}).get("m_PathID")
                        if tex_pid:
                            slot[key] = _texture(env, tex_pid)
                            slot["st"][key] = _scale_offset(v)
                            break
                # How far the moss creeps down the sides is the material's
                # business, not the renderer's — a mossy rock and a bare one
                # differ only by these.
                floats = dict(props.get("m_Floats") or [])
                slot["moss_alpha"] = float(floats.get("_MossAlpha", 1.0))
                slot["moss_edge"] = float(floats.get("_MossTransition", 0.4))
                break
            out.append(slot)
    except Exception:
        pass
    return out


def level_setups(root_go, max_depth=8):
    """Valheim's LevelEffects, as [{scale, hue, saturation, value, enable}].

    Index 0 is a one-star creature, index 1 two-star. The star visual is a child
    the prefab keeps disabled until that level, so its path_id is what
    collect_meshes needs in `enable`."""
    out = []

    def visit(go, depth):
        for c in go.m_Components:
            try:
                r = c.deref()
            except Exception:
                continue
            if r.type.name != "MonoBehaviour":
                continue
            try:
                tt = r.read_typetree()
            except Exception:
                continue
            for setup in (tt.get("m_levelSetups") or []):
                out.append({
                    "scale": float(setup.get("m_scale", 1.0) or 1.0),
                    "hue": float(setup.get("m_hue", 0.0) or 0.0),
                    "saturation": float(setup.get("m_saturation", 0.0) or 0.0),
                    "value": float(setup.get("m_value", 0.0) or 0.0),
                    "enable": (setup.get("m_enableObject") or {}).get("m_PathID") or 0,
                })
        tr = _first(go, "Transform")
        if tr is None or depth >= max_depth or out:
            return
        for ch in (tr.read().m_Children or []):
            try:
                visit(ch.read().m_GameObject.read(), depth + 1)
            except Exception:
                continue

    visit(root_go, 0)
    return out


def apply_hsv(img, hue, sat, val):
    """Shift an RGBA float image in HSV, the way LevelEffects tints a creature."""
    if not (hue or sat or val):
        return img
    rgb = img[..., :3]
    mx = rgb.max(axis=-1)
    mn = rgb.min(axis=-1)
    d = mx - mn
    h = np.zeros_like(mx)
    safe = d > 1e-8
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    with np.errstate(invalid="ignore", divide="ignore"):
        h = np.where(safe & (mx == r), ((g - b) / np.where(d == 0, 1, d)) % 6, h)
        h = np.where(safe & (mx == g), ((b - r) / np.where(d == 0, 1, d)) + 2, h)
        h = np.where(safe & (mx == b), ((r - g) / np.where(d == 0, 1, d)) + 4, h)
    h = (h / 6.0 + hue) % 1.0
    s = np.clip(np.where(mx > 0, d / np.where(mx == 0, 1, mx), 0) + sat, 0, 1)
    v = np.clip(mx + val, 0, 1)
    i = np.floor(h * 6.0)
    f = h * 6.0 - i
    pp = v * (1 - s)
    q = v * (1 - f * s)
    t = v * (1 - (1 - f) * s)
    i = i.astype(np.int32) % 6
    ic = i[..., None]                 # conditions must match the RGB choices
    out = np.select(
        [ic == 0, ic == 1, ic == 2, ic == 3, ic == 4, ic == 5],
        [np.stack([v, t, pp], -1), np.stack([q, v, pp], -1), np.stack([pp, v, t], -1),
         np.stack([pp, q, v], -1), np.stack([t, pp, v], -1), np.stack([v, pp, q], -1)],
    )
    res = img.copy()
    res[..., :3] = out
    return res


def collect_meshes(root_go, want_texture=True, max_depth=8, enable=()):
    """Walk a prefab and return [(path, mesh, world_matrix, albedo)].

    `path` is the full ancestry ("StartTemple/RaspberryBush/Cube"), not just the
    leaf — mesh-bearing objects are very often called things like "Cube", so the
    parent is the only part worth matching on when excluding.

    Objects the prefab ships disabled are skipped, because that is what the game
    shows: star effects, alternate skins and broken/ragdoll variants all sit in
    the hierarchy switched off. `enable` is a set of path_ids to turn back on —
    that is how a star variant gets its extra visual."""
    found = []
    enable = set(enable or ())

    def visit(go, parent: np.ndarray, depth: int, path: str):
        tr = _first(go, "Transform")
        if tr is None:
            return
        if not getattr(go, "m_IsActive", True) and getattr(go, "path_id", None) not in enable:
            return
        world = parent @ trs(tr.read_typetree())
        here = f"{path}/{getattr(go, 'm_Name', '?')}" if path else (getattr(go, "m_Name", "?") or "?")

        mf = _first(go, "MeshFilter")
        if mf is not None:
            try:
                mesh = mf.read().m_Mesh.read()
                if mesh is not None and getattr(mesh, "m_Name", ""):
                    mr = _first(go, "MeshRenderer")
                    mats = materials_of(mr) if (mr is not None and want_texture) else []
                    found.append((here, mesh, world, mats))
            except Exception:
                pass
        smr = _first(go, "SkinnedMeshRenderer")
        if smr is not None:
            try:
                mesh = smr.read().m_Mesh.read()
                if mesh is not None and getattr(mesh, "m_Name", ""):
                    found.append((here, mesh, world,
                                  materials_of(smr) if want_texture else []))
            except Exception:
                pass

        if depth >= max_depth:
            return
        for ch in (tr.read().m_Children or []):
            try:
                child_go = ch.read().m_GameObject.read()
            except Exception:
                continue
            visit(child_go, world, depth + 1, here)

    visit(root_go, np.eye(4), 0, "")
    return found


# ── geometry ──────────────────────────────────────────────────────────

_OBJ_F = re.compile(r"(-?\d+)(?:/(-?\d*))?(?:/(-?\d*))?")


def parse_obj(text: str):
    """UnityPy exports OBJ; positions, normals, uvs and triangles per submesh.

    Submeshes come through as `g` groups and map 1:1 onto the renderer's
    material slots, which is how a boss stone keeps its chains on a different
    material from the rock."""
    v, vn, vt = [], [], []
    groups: list[list] = []
    faces = None
    for line in text.splitlines():
        if not line or line[0] == "#":
            continue
        tag, _, rest = line.partition(" ")
        if tag == "g":
            groups.append([])
            faces = groups[-1]
            continue
        if tag == "v":
            v.append([float(x) for x in rest.split()[:3]])
        elif tag == "vn":
            vn.append([float(x) for x in rest.split()[:3]])
        elif tag == "vt":
            vt.append([float(x) for x in rest.split()[:2]])
        elif tag == "f":
            idx = []
            for part in rest.split():
                m = _OBJ_F.match(part)
                if not m:
                    continue
                vi = int(m.group(1))
                ti = int(m.group(2)) if m.group(2) else 0
                ni = int(m.group(3)) if m.group(3) else 0
                idx.append((vi, ti, ni))
            if faces is None:                       # faces before any `g`
                groups.append([])
                faces = groups[-1]
            for k in range(1, len(idx) - 1):        # fan-triangulate
                faces.append((idx[0], idx[k], idx[k + 1]))
    return (np.array(v, dtype=np.float64) if v else np.zeros((0, 3)),
            np.array(vn, dtype=np.float64) if vn else np.zeros((0, 3)),
            np.array(vt, dtype=np.float64) if vt else np.zeros((0, 2)),
            [g for g in groups if g])


def _resolve(i, n):
    return (i - 1) if i > 0 else (n + i)


def build_scene(parts, want_texture=True):
    """Flatten every mesh into one triangle soup in world space."""
    P, N, UV, MAT = [], [], [], []
    for name, mesh, world, mats in parts:
        try:
            v, vn, vt, groups = parse_obj(mesh.export())
        except Exception as e:
            print(f"  skip {name}: {type(e).__name__} {e}", file=sys.stderr)
            continue
        if not len(v) or not groups:
            continue
        vw = (world[:3, :3] @ v.T).T + world[:3, 3]
        nw = (world[:3, :3] @ vn.T).T if len(vn) else np.zeros((0, 3))
        for gi, faces in enumerate(groups):
            # one material slot per submesh; fall back to the first
            mat = None
            if want_texture and mats:
                mat = mats[gi] if gi < len(mats) else mats[0]
            for a, b, c in faces:
                ia, ib, ic = (_resolve(a[0], len(v)), _resolve(b[0], len(v)), _resolve(c[0], len(v)))
                if max(ia, ib, ic) >= len(vw) or min(ia, ib, ic) < 0:
                    continue
                P.append([vw[ia], vw[ib], vw[ic]])
                if len(nw):
                    na, nb, nc = (_resolve(a[2], len(vn)), _resolve(b[2], len(vn)),
                                  _resolve(c[2], len(vn)))
                    N.append([nw[na], nw[nb], nw[nc]]
                             if max(na, nb, nc) < len(nw) and min(na, nb, nc) >= 0 else None)
                else:
                    N.append(None)
                if len(vt) and mat:
                    ta, tb, tc = (_resolve(a[1], len(vt)), _resolve(b[1], len(vt)),
                                  _resolve(c[1], len(vt)))
                    UV.append([vt[ta], vt[tb], vt[tc]]
                              if max(ta, tb, tc) < len(vt) and min(ta, tb, tc) >= 0 else None)
                else:
                    UV.append(None)
                MAT.append(mat)
    return np.array(P) if P else np.zeros((0, 3, 3)), N, UV, MAT


# ── rasteriser ────────────────────────────────────────────────────────

def look_at(yaw_deg, pitch_deg):
    y, p = math.radians(yaw_deg), math.radians(pitch_deg)
    fwd = np.array([math.cos(p) * math.sin(y), math.sin(p), math.cos(p) * math.cos(y)])
    fwd /= np.linalg.norm(fwd)
    up = np.array([0.0, 1.0, 0.0])
    right = np.cross(up, fwd)
    if np.linalg.norm(right) < 1e-6:
        right = np.array([1.0, 0.0, 0.0])
    right /= np.linalg.norm(right)
    trueup = np.cross(fwd, right)
    return np.stack([right, trueup, fwd])      # rows = camera basis


def render(P, N, UV, MAT, size, yaw, pitch, bg, scale_hint, alpha_cutoff=0.5,
           moss=None, ambient=AMBIENT, exposure=1.0, emissive=0.0,
           tint="#ffffff", bump=1.0):
    S = size * SUPERSAMPLE
    if len(P) == 0:
        sys.exit("nothing to render — no triangles were collected")

    basis = look_at(yaw, pitch)
    cam = P.reshape(-1, 3) @ basis.T
    lo, hi = cam.min(axis=0), cam.max(axis=0)
    centre = (lo + hi) / 2
    extent = max((hi - lo)[:2].max(), 1e-6) / max(scale_hint, 1e-3)
    ppu = (S * 0.92) / extent

    cam3 = (P @ basis.T - centre)
    xs = cam3[:, :, 0] * ppu + S / 2
    ys = -cam3[:, :, 1] * ppu + S / 2
    zs = cam3[:, :, 2]

    colour = np.zeros((S, S, 3), dtype=np.float32)
    alpha = np.zeros((S, S), dtype=np.float32)
    zbuf = np.full((S, S), np.inf, dtype=np.float64)

    light = LIGHT_DIR / np.linalg.norm(LIGHT_DIR)
    # Valheim's biomes light everything through a heavy colour cast — the
    # Meadows spawn reads green on grass, dirt and stone alike. Tinting the
    # light reproduces that; it is not the material's moss.
    tr, tg, tb = (int(tint[i:i + 2], 16) / 255 for i in (1, 3, 5))
    tint_rgb = np.array([tr, tg, tb], dtype=np.float32)
    tex_cache: dict[int, np.ndarray] = {}

    order = np.argsort(zs.mean(axis=1))          # near to far helps the z-test
    for ti in order:
        x0, x1, x2 = xs[ti]; y0, y1, y2 = ys[ti]; z0, z1, z2 = zs[ti]
        area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        if area == 0:
            continue
        if area > 0:                              # backface
            continue
        minx = max(int(math.floor(min(x0, x1, x2))), 0)
        maxx = min(int(math.ceil(max(x0, x1, x2))), S - 1)
        miny = max(int(math.floor(min(y0, y1, y2))), 0)
        maxy = min(int(math.ceil(max(y0, y1, y2))), S - 1)
        if minx > maxx or miny > maxy:
            continue

        yy, xx = np.mgrid[miny:maxy + 1, minx:maxx + 1]
        px, py = xx + 0.5, yy + 0.5
        w0 = ((x1 - x0) * (py - y0) - (px - x0) * (y1 - y0)) / area
        w1 = ((px - x0) * (y2 - y0) - (x2 - x0) * (py - y0)) / area
        w2 = 1.0 - w0 - w1
        inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        if not inside.any():
            continue
        z = w2 * z0 + w1 * z1 + w0 * z2
        sub = zbuf[miny:maxy + 1, minx:maxx + 1]
        hit = inside & (z < sub)
        if not hit.any():
            continue

        # Geometric normal first; the normal map perturbs it below, once the
        # material's textures are in scope.
        n = N[ti]
        if n is None:
            e1 = P[ti][1] - P[ti][0]
            e2 = P[ti][2] - P[ti][0]
            fn = np.cross(e1, e2)
            ln = np.linalg.norm(fn)
            fn = fn / ln if ln else np.array([0.0, 1.0, 0.0])
            norm = np.broadcast_to(fn.astype(np.float64), hit.shape + (3,)).copy()
        else:
            nn = np.array(n, dtype=np.float64)
            norm = (w2[..., None] * nn[0] + w1[..., None] * nn[1] + w0[..., None] * nn[2])
            ln = np.linalg.norm(norm, axis=-1, keepdims=True)
            norm = np.divide(norm, np.where(ln == 0, 1, ln))

        mat = MAT[ti]
        uv = UV[ti]

        def sample(img, slot=None):
            key = id(img)
            if key not in tex_cache:
                tex_cache[key] = np.asarray(img, dtype=np.float32) / 255.0
            t = tex_cache[key]
            th, tw = t.shape[:2]
            uvv = np.array(uv, dtype=np.float64)
            u = w2 * uvv[0][0] + w1 * uvv[1][0] + w0 * uvv[2][0]
            vv = w2 * uvv[0][1] + w1 * uvv[1][1] + w0 * uvv[2][1]
            st = (mat or {}).get("st", {}).get(slot)
            if st:
                (sx, sy), (ox, oy) = st
                u = u * sx + ox
                vv = vv * sy + oy
            fx = (u % 1.0) * (tw - 1)
            fy = (1.0 - (vv % 1.0)) * (th - 1)
            # Bilinear. A rune carved into a small corner of the atlas gets
            # magnified hugely across the face, and nearest-neighbour turns it
            # into blocky ink instead of a soft groove.
            x0 = np.clip(np.floor(fx), 0, tw - 1).astype(np.int32)
            y0 = np.clip(np.floor(fy), 0, th - 1).astype(np.int32)
            x1 = np.clip(x0 + 1, 0, tw - 1)
            y1 = np.clip(y0 + 1, 0, th - 1)
            ax = (fx - x0)[..., None].astype(np.float32)
            ay = (fy - y0)[..., None].astype(np.float32)
            top = t[y0, x0] * (1 - ax) + t[y0, x1] * ax
            bot = t[y1, x0] * (1 - ax) + t[y1, x1] * ax
            return top * (1 - ay) + bot * ay

        if mat and mat.get("bump") is not None and uv is not None and bump > 0:
            frame = _tangent_frame(P[ti], uv)
            if frame is not None:
                tan, bit = frame
                # Gram-Schmidt against the shading normal keeps the frame
                # orthogonal on curved surfaces.
                tan = tan - norm * (norm * tan).sum(axis=-1, keepdims=True)
                tl = np.linalg.norm(tan, axis=-1, keepdims=True)
                tan = np.divide(tan, np.where(tl == 0, 1, tl))
                bit = bit - norm * (norm * bit).sum(axis=-1, keepdims=True)
                bl = np.linalg.norm(bit, axis=-1, keepdims=True)
                bit = np.divide(bit, np.where(bl == 0, 1, bl))
                ts = _decode_normal(sample(mat["bump"], "bump"))
                ts[..., 0] *= bump
                ts[..., 1] *= bump
                perturbed = (tan * ts[..., 0:1] + bit * ts[..., 1:2]
                             + norm * ts[..., 2:3])
                pl = np.linalg.norm(perturbed, axis=-1, keepdims=True)
                norm = np.divide(perturbed, np.where(pl == 0, 1, pl))

        lam = np.clip((norm * light).sum(axis=-1), 0, 1)
        shade = (ambient + (1 - ambient) * lam).astype(np.float32)

        if mat and mat.get("base") is not None and uv is not None:
            texel = sample(mat["base"], "base")
            # Foliage and chains are alpha-cutout cards; without this they show
            # up as opaque black rectangles.
            if texel.shape[-1] == 4 and alpha_cutoff > 0:
                hit = hit & (texel[..., 3] >= alpha_cutoff)
                if not hit.any():
                    continue
            base = texel[..., :3].copy()
        else:
            base = np.broadcast_to(np.array([0.62, 0.60, 0.57], dtype=np.float32),
                                   hit.shape + (3,)).copy()

        # moss only grows on what faces the sky
        # `--moss` overrides the material outright, so a stone the game keeps
        # bare (_MossAlpha 0, like the start platform) can still be mossed for
        # a render if that is what you want.
        strength = float(mat.get("moss_alpha", 1.0)) if mat else 1.0
        if moss is not None:
            strength = moss
        if mat and mat.get("moss") is not None and uv is not None and strength > 0:
            up = norm[..., 1]
            edge = max(float(mat.get("moss_edge", 0.4)), 1e-3)
            cover = np.clip((np.asarray(up) - (1.0 - edge * 2)) / edge, 0, 1) * strength
            mtex = sample(mat["moss"], "moss")[..., :3]
            base = base * (1 - cover[..., None]) + mtex * cover[..., None]

        px_col = np.clip(base * shade[..., None] * exposure * tint_rgb, 0, 1)

        # carved runes are an emissive layer, not part of the albedo
        if mat and mat.get("emissive") is not None and uv is not None and emissive > 0:
            em = sample(mat["emissive"], "emissive")
            px_col = np.clip(px_col + em[..., :3] * emissive, 0, 1)
        tgt_c = colour[miny:maxy + 1, minx:maxx + 1]
        tgt_a = alpha[miny:maxy + 1, minx:maxx + 1]
        tgt_c[hit] = px_col[hit]
        tgt_a[hit] = 1.0
        sub[hit] = z[hit]

    img = np.zeros((S, S, 4), dtype=np.float32)
    img[..., :3] = colour
    img[..., 3] = alpha
    if bg != "none":
        r, g, b = (int(bg[i:i + 2], 16) / 255 for i in (1, 3, 5))
        back = np.array([r, g, b], dtype=np.float32)
        a = alpha[..., None]
        img[..., :3] = colour * a + back * (1 - a)
        img[..., 3] = 1.0

    out = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8), "RGBA")
    return out.resize((size, size), Image.LANCZOS)


# ── entry points ──────────────────────────────────────────────────────

def find_mesh_by_name(env, name):
    want = name.lower()
    exact, loose = None, []
    for o in env.objects:
        if o.type.name != "Mesh":
            continue
        try:
            m = o.read()
        except Exception:
            continue
        nm = (getattr(m, "m_Name", "") or "")
        if nm.lower() == want:
            exact = m
            break
        if want in nm.lower():
            loose.append(m)
    return exact or (loose[0] if loose else None)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--bundles", default=DEFAULT_BUNDLES)
    ap.add_argument("--prefab", action="append", default=[])
    ap.add_argument("--mesh", action="append", default=[])
    ap.add_argument("--out", action="append", default=[])
    ap.add_argument("--job", action="append", default=[],
                    help="NAME=out.png — NAME is a mesh name or a prefab path")
    ap.add_argument("--list", dest="list_meshes")
    ap.add_argument("--list-prefabs", dest="list_prefabs")
    ap.add_argument("--size", type=int, default=512)
    ap.add_argument("--yaw", type=float, default=35.0)
    ap.add_argument("--pitch", type=float, default=25.0)
    ap.add_argument("--bg", default="none")
    ap.add_argument("--no-texture", action="store_true")
    ap.add_argument("--exclude", action="append", default=[],
                    help="skip mesh objects whose name matches this substring "
                         "(repeatable) — handy for dropping foliage and clutter")
    ap.add_argument("--ambient", type=float, default=0.55,
                    help="flat fill light; the game's daylight is much brighter than "
                         "a single lambert term, so this defaults high")
    ap.add_argument("--exposure", type=float, default=1.0)
    ap.add_argument("--bump", type=float, default=1.0,
                    help="normal-map strength; 0 renders the surface flat")
    ap.add_argument("--tint", default="#ffffff",
                    help="light colour, e.g. #8fd0a0 for the green Meadows cast")
    ap.add_argument("--emissive", type=float, default=0.0,
                    help="strength of _EmissiveTex — a boss stone's rune only glows "
                         "once its trophy is hung, so this is off by default")
    ap.add_argument("--moss", type=float, default=None,
                    help="force moss coverage 0..1, overriding the material's "
                         "_MossAlpha (default: whatever the material asks for)")
    ap.add_argument("--alpha-cutoff", type=float, default=0.5,
                    help="discard texture pixels below this alpha (0 disables)")
    ap.add_argument("--scale-hint", type=float, default=1.0)
    ap.add_argument("--level", type=int, default=0,
                    help="star level: 0 plain, 1 one-star, 2 two-star. Applies the "
                         "prefab's own LevelEffects (tint plus the star visual)")
    a = ap.parse_args()

    env = load_env(a.bundles)

    if a.list_prefabs:
        pat = a.list_prefabs.lower()
        hits = sorted(c for c in env.container.container_dict if pat in c.lower())
        print(f"{len(hits)} container path(s) matching {a.list_prefabs!r}:")
        for h in hits[:200]:
            print("  ", h)
        return

    if a.list_meshes:
        pat = a.list_meshes.lower()
        seen = set()
        for o in env.objects:
            if o.type.name != "Mesh":
                continue
            try:
                nm = getattr(o.read(), "m_Name", "")
            except Exception:
                continue
            if nm and pat in nm.lower() and nm not in seen:
                seen.add(nm)
        print(f"{len(seen)} mesh name(s) matching {a.list_meshes!r}:")
        for nm in sorted(seen)[:200]:
            print("  ", nm)
        return

    jobs = []
    for spec in a.job:
        name, _, out = spec.partition("=")
        if not out:
            sys.exit(f"--job needs NAME=out.png, got {spec!r}")
        jobs.append((name, out))
    for i, p in enumerate(a.prefab):
        jobs.append((p, a.out[i] if i < len(a.out) else f"{os.path.basename(p)}.png"))
    for i, m in enumerate(a.mesh):
        jobs.append((m, a.out[len(a.prefab) + i] if len(a.prefab) + i < len(a.out) else f"{m}.png"))
    if not jobs:
        sys.exit("nothing to do — pass --prefab/--mesh/--job, or --list / --list-prefabs")

    cd = env.container.container_dict
    for name, out in jobs:
        print(f"rendering {name} -> {out}", file=sys.stderr)
        setup = None
        if name in cd:                                  # a prefab path
            go = cd[name].read()
            enable = ()
            if a.level > 0:
                setups = level_setups(go)
                if len(setups) >= a.level:
                    setup = setups[a.level - 1]
                    enable = (setup["enable"],) if setup["enable"] else ()
                else:
                    print(f"  no LevelEffects for level {a.level} — rendering plain",
                          file=sys.stderr)
            parts = collect_meshes(go, want_texture=not a.no_texture, enable=enable)
            if a.exclude:
                before = len(parts)
                parts = [p for p in parts
                         if not any(x.lower() in p[0].lower() for x in a.exclude)]
                print(f"  excluded {before - len(parts)} object(s)", file=sys.stderr)
            if not parts:
                print(f"  no meshes under {name}", file=sys.stderr)
                continue
            print(f"  {len(parts)} mesh object(s)", file=sys.stderr)
        else:                                           # a mesh name
            m = find_mesh_by_name(env, name)
            if m is None:
                print(f"  no mesh or prefab called {name!r}", file=sys.stderr)
                continue
            parts = [(name, m, np.eye(4), None)]
        P, N, UV, MAT = build_scene(parts, want_texture=not a.no_texture)
        print(f"  {len(P)} triangles", file=sys.stderr)
        img = render(P, N, UV, MAT, a.size, a.yaw, a.pitch, a.bg, a.scale_hint,
                     a.alpha_cutoff, a.moss, a.ambient, a.exposure, a.emissive,
                     a.tint, a.bump)
        if setup:
            arr = apply_hsv(np.asarray(img, dtype=np.float32) / 255.0,
                            setup["hue"], setup["saturation"], setup["value"])
            img = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), "RGBA")
        os.makedirs(os.path.dirname(os.path.abspath(out)) or ".", exist_ok=True)
        img.save(out)
        print(f"  wrote {out} ({img.size[0]}x{img.size[1]})", file=sys.stderr)


if __name__ == "__main__":
    main()
