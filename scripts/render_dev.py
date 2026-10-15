#!/usr/bin/env python3
"""
render_dev.py — fast iteration on render_prefab.py.

Loading the game bundles takes about a minute, so this keeps them in memory
behind a tiny local HTTP server and re-imports render_prefab.py on every
request. Edit the renderer, hit the URL, look at the PNG — a few seconds a turn.

    python scripts/render_dev.py                 # serves on http://127.0.0.1:8765

    curl "http://127.0.0.1:8765/render?prefab=WoodHouse6&yaw=145&pitch=45&ref=C:/path/ref.jpg"

Query parameters (all optional except prefab):
    prefab     prefab name, matched case-insensitively on the file name
    yaw pitch  camera, degrees (default 35 / 35)
    size       px per panel (default 400)
    exposure ambient bump    passed to render()
    ref        an image to show to the left, e.g. an in-game screenshot
    out        PNG to write (default render_dev.png next to this script)
    fresh=1    also drop the decoded-texture cache (after changing texture code)
    ss         supersampling factor (default 2; 1 is ~2x faster for iterating)
    profile=1  return a cProfile breakdown of the rasteriser
    tex=0      untextured clay
    kw_NAME    passed to render() as NAME (e.g. kw_cull=0)
    rp_NAME    set render_prefab.NAME for this request (e.g. rp_DEBUG_FLIP_V=1)

The render is written to `out`; the response is a one-line summary with timing.
"""
from __future__ import annotations

import importlib
import os
import sys
import time
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import render_prefab as rp  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

DEFAULT_OUT = os.path.join(HERE, "render_dev.png")

print("loading bundles once ...", flush=True)
ENV = rp.load_env(rp.DEFAULT_BUNDLES)
PATHS = {}
for p in sorted(ENV.container.container_dict, key=lambda p: "/world/locations/" not in p.lower()):
    if p.lower().endswith(".prefab"):
        PATHS.setdefault(os.path.basename(p).lower()[:-len(".prefab")], p)
rp._lookup(ENV, "Material", 0)          # build the object index now, not on first request
CACHE = {"index": rp._INDEX, "textures": rp._TEXTURES, "shaders": rp._SHADER_NAMES}
print(f"ready: {len(PATHS)} prefabs indexed", flush=True)


def _val(v: str):
    for conv in (int, float):
        try:
            return conv(v)
        except ValueError:
            pass
    return {"true": True, "false": False}.get(v.lower(), v)


def render(q: dict) -> str:
    global rp
    t0 = time.time()
    # Pick up renderer edits, but keep the expensive state.
    rp = importlib.reload(rp)
    rp._ENV = ENV
    rp._INDEX = CACHE["index"]
    rp._SHADER_NAMES = CACHE["shaders"]
    if q.get("fresh") == "1":
        CACHE["textures"] = {}
    rp._TEXTURES = CACHE["textures"]
    # rp_NAME=value sets a module-level switch on the renderer for this request.
    for k, v in q.items():
        if k.startswith("rp_"):
            setattr(rp, k[3:], _val(v))

    name = q["prefab"]
    path = PATHS.get(name.lower())
    if path is None:
        return f"no prefab called {name!r}"
    size = int(q.get("size", 400))
    yaw = float(q.get("yaw", 35))
    pitch = float(q.get("pitch", 35))

    rp.SUPERSAMPLE = int(q.get("ss", 2))
    tex = q.get("tex", "1") != "0"
    parts = rp.collect_meshes(ENV.container.container_dict[path].read(), want_texture=tex, max_depth=20)
    parts = [p for p in parts if "interior" not in p[0].lower()] or parts
    P, N, UV, MAT = rp.build_scene(parts, want_texture=tex)
    t1 = time.time()
    # kw_NAME=value is passed straight to render(), e.g. kw_cull=0
    extra = {k[3:]: _val(v) for k, v in q.items() if k.startswith("kw_")}
    def draw():
        return rp.render(P, N, UV, MAT, size, yaw, pitch, "none", 0.9,
                         ambient=float(q.get("ambient", 0.45)), exposure=float(q.get("exposure", 1.5)),
                         bump=float(q.get("bump", 1.0)), frame_pct=0.5, **extra)
    prof = ""
    if q.get("profile") == "1":
        import cProfile, io, pstats
        pr = cProfile.Profile()
        img = pr.runcall(draw)
        buf = io.StringIO()
        pstats.Stats(pr, stream=buf).sort_stats("tottime").print_stats(15)
        prof = "\n" + buf.getvalue()
    else:
        img = draw()
    t2 = time.time()

    panels = []
    if q.get("ref"):
        panels.append(("reference", Image.open(q["ref"]).convert("RGB").resize((size, size))))
    panels.append((f"{name} yaw {yaw:g} pitch {pitch:g}", img))
    sheet = Image.new("RGB", (size * len(panels), size + 16), (38, 70, 96))
    d = ImageDraw.Draw(sheet)
    for i, (label, im) in enumerate(panels):
        sheet.paste(im, (i * size, 0), im if im.mode == "RGBA" else None)
        d.text((i * size + 4, size + 2), label, fill=(255, 255, 255))
    out = q.get("out", DEFAULT_OUT)
    sheet.save(out)
    return (f"{out}  {len(P)} tris  scene {t1 - t0:.1f}s  raster {t2 - t1:.1f}s  "
            f"total {time.time() - t0:.1f}s{prof}")


def inspect(q: dict) -> str:
    """Mesh parts with their materials, plus every LODGroup's levels."""
    global rp
    rp = importlib.reload(rp)
    rp._ENV, rp._INDEX, rp._SHADER_NAMES, rp._TEXTURES = ENV, CACHE["index"], CACHE["shaders"], CACHE["textures"]
    path = PATHS.get(q["prefab"].lower())
    if path is None:
        return f"no prefab called {q['prefab']!r}"
    root = ENV.container.container_dict[path].read()
    lines = []

    def lods(go, depth=0):
        lg = rp._first(go, "LODGroup")
        if lg is not None:
            tt = lg.read_typetree()
            levels = tt.get("m_LODs") or []
            lines.append(f"LODGroup on {go.m_Name}: {len(levels)} levels, keys={list(levels[0].keys()) if levels else []}")
            for i, lv in enumerate(levels):
                rs = lv.get("renderers") or lv.get("m_Renderers") or []
                lines.append(f"   L{i}: {len(rs)} renderers, sample={rs[:1]}")
        tr = rp._first(go, "Transform")
        if tr is not None and depth < 20:
            for ch in tr.read().m_Children:
                try:
                    lods(ch.read().m_GameObject.read(), depth + 1)
                except Exception:
                    pass

    lods(root)
    parts = rp.collect_meshes(root, want_texture=False, max_depth=20)
    lines.append(f"{len(parts)} mesh parts after LOD filtering")
    if q.get("parts") == "1":
        for name, mesh, *_ in parts:
            lines.append(f"   {name}  ({getattr(mesh, 'm_Name', '?')})")
    return "\n".join(lines)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        u = urlparse(self.path)
        q = {k: v[-1] for k, v in parse_qs(u.query).items()}
        try:
            if u.path == "/render":
                msg = render(q)
            elif u.path == "/inspect":
                msg = inspect(q)
            else:
                msg = "use /render?prefab=... or /inspect?prefab=...[&parts=1]"
            code = 200
        except Exception:
            msg, code = traceback.format_exc(), 500
        body = (msg + "\n").encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", int(os.environ.get("RENDER_DEV_PORT", 8765))), Handler).serve_forever()
