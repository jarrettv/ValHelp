# Tileable 512x512 texture of burnt Ashlands trees for the map (seen from above at an angle,
# like forest.png): charcoal trunks with jagged bare branches, an ember-lit rim, soft ash shadows.
import math, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# Usage: python scripts/gen_forest_ashlands.py api/wwwroot/forest_ashlands.png
OUT = sys.argv[1]
N, SS = 512, 4                      # output size, supersampling
W = N * SS
rng = random.Random(7)

# Poisson-ish tree bases on a torus
pts = []
for _ in range(20000):
    if len(pts) >= 52: break
    p = (rng.uniform(0, N), rng.uniform(0, N))
    if all(min(abs(p[0]-q[0]), N-abs(p[0]-q[0]))**2 + min(abs(p[1]-q[1]), N-abs(p[1]-q[1]))**2 > 58**2 for q in pts):
        pts.append(p)

shadow = Image.new('L', (W, W), 0)
sd = ImageDraw.Draw(shadow)
col = Image.new('RGBA', (W, W), (0, 0, 0, 0))
cd = ImageDraw.Draw(col)

CHAR = (30, 24, 26)
RIM = (122, 52, 34)
EMBER = (255, 132, 40)

def wrap_draw(fn):
    for ox in (-W, 0, W):
        for oy in (-W, 0, W):
            fn(ox, oy)

def line(d, a, b, w, c):
    wrap_draw(lambda ox, oy: d.line([(a[0]+ox, a[1]+oy), (b[0]+ox, b[1]+oy)], fill=c, width=max(1, int(w))))
    r = w / 2
    if w > 3:
        wrap_draw(lambda ox, oy: d.ellipse([b[0]+ox-r, b[1]+oy-r, b[0]+ox+r, b[1]+oy+r], fill=c))

segs = []   # (a, b, width, depth)
def branch(p, ang, length, w, depth):
    # jagged: a few kinks along the way
    cur = p
    n = 3
    for k in range(n):
        a2 = ang + rng.uniform(-0.25, 0.25)
        nxt = (cur[0] + math.cos(a2) * length / n, cur[1] - math.sin(a2) * length / n)
        segs.append((cur, nxt, w * (1 - 0.25 * k / n), depth))
        cur = nxt
    if depth >= 3 or w < 2.2: return
    for _ in range(rng.randint(2, 3)):
        side = rng.choice((-1, 1))
        branch(cur, ang + side * rng.uniform(0.35, 0.9), length * rng.uniform(0.45, 0.7), w * 0.55, depth + 1)

trees = []
for (x, y) in pts:
    s = rng.uniform(0.75, 1.25)
    base = (x * SS, y * SS)
    h = rng.uniform(52, 78) * s * SS
    w0 = rng.uniform(5, 7) * s * SS
    # ash shadow: long soft ellipse to the lower right
    for i in range(6, 0, -1):
        rx, ry = (11 + i * 4) * s * SS, (6 + i * 2.2) * s * SS
        cx, cy = base[0] + 6 * SS * s, base[1] + 3 * SS
        wrap_draw(lambda ox, oy, i=i: sd.ellipse([cx-rx+ox, cy-ry+oy, cx+rx+ox, cy+ry+oy], fill=int(40 + (6 - i) * 30)))
    trees.append((base, h, w0, s))

# draw back-to-front (smaller y first)
for base, h, w0, s in sorted(trees, key=lambda t: t[0][1]):
    segs.clear()
    lean = math.pi / 2 + rng.uniform(-0.12, 0.12)
    top = (base[0] + math.cos(lean) * h, base[1] - math.sin(lean) * h)
    # trunk in short tapered pieces
    n = 8
    for k in range(n):
        a = (base[0] + (top[0]-base[0]) * k / n, base[1] + (top[1]-base[1]) * k / n)
        b = (base[0] + (top[0]-base[0]) * (k+1) / n, base[1] + (top[1]-base[1]) * (k+1) / n)
        segs.append((a, b, w0 * (1 - 0.75 * k / n), 0))
    for k in range(rng.randint(4, 6)):
        t = rng.uniform(0.35, 0.95)
        p = (base[0] + (top[0]-base[0]) * t, base[1] + (top[1]-base[1]) * t)
        side = 1 if k % 2 == 0 else -1
        branch(p, lean + side * rng.uniform(0.45, 1.1), h * rng.uniform(0.25, 0.42) * (1.15 - t * 0.5), w0 * 0.45 * (1.1 - t * 0.5), 1)
    # rim light (ember glow from the left/below), then charcoal body slightly offset
    for a, b, w, d in segs:
        line(cd, (a[0] - w * 0.3, a[1]), (b[0] - w * 0.3, b[1]), w * 1.15, RIM + (255,))
    for a, b, w, d in segs:
        line(cd, (a[0] + w * 0.12, a[1]), (b[0] + w * 0.12, b[1]), w * 0.9, CHAR + (255,))
    # a few smouldering embers on the trunk
    for _ in range(rng.randint(0, 2)):
        t = rng.uniform(0.1, 0.6)
        ex = base[0] + (top[0]-base[0]) * t + rng.uniform(-1, 1) * w0 * 0.2
        ey = base[1] + (top[1]-base[1]) * t
        r = rng.uniform(0.7, 1.2) * SS
        wrap_draw(lambda ox, oy: cd.ellipse([ex-r+ox, ey-r+oy, ex+r+ox, ey+r+oy], fill=EMBER + (255,)))

# downsample, then put shadows under the trees
col = col.resize((N, N), Image.LANCZOS)
shadow = shadow.resize((N, N), Image.LANCZOS)
# wrap-aware blur: tile 3x3, blur, crop the middle
big = Image.new('L', (N * 3, N * 3))
for i in range(3):
    for j in range(3): big.paste(shadow, (i * N, j * N))
shadow = big.filter(ImageFilter.GaussianBlur(5)).crop((N, N, 2 * N, 2 * N))

c = np.asarray(col).astype(np.float32) / 255
sa = np.asarray(shadow).astype(np.float32) / 255 * 0.7
out_a = c[..., 3] + sa * (1 - c[..., 3])
rgb = (c[..., :3] * c[..., 3:4] + np.array([16, 12, 13], np.float32)[None, None] / 255 * (sa * (1 - c[..., 3]))[..., None])
rgb = np.where(out_a[..., None] > 0, rgb / np.maximum(out_a[..., None], 1e-6), 0)
img = np.dstack([rgb, out_a])
Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(OUT, optimize=True)
print('trees', len(pts))
