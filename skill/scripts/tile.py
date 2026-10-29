#!/usr/bin/env python3
"""Cut a large P&ID sheet into overlapping, upscaled tiles so small tags are legible.

    python3 -I tile.py <image> [--grid 3x2] [--overlap 0.12] [--scale 2] [--out DIR]
    python3 -I tile.py <image> --crop x0,y0,x1,y1 [--scale 3] [--out DIR]   # fractions 0..1

Tiles are written as <stem>_r<row>c<col>.png (or <stem>_crop.png) in --out (default: a
<stem>_tiles folder next to the image) and their paths are printed. Needs Pillow; on macOS
without Pillow, `sips -c <h> <w> --cropOffset <y> <x> in.png --out out.png` does single crops.
"""
import argparse
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is not installed (pip install pillow) - or crop with macOS `sips`.")

Image.MAX_IMAGE_PIXELS = None  # P&ID scans at 300+ dpi are big

ap = argparse.ArgumentParser()
ap.add_argument("image")
ap.add_argument("--grid", default="3x2", help="COLSxROWS")
ap.add_argument("--overlap", type=float, default=0.12, help="fraction of a tile shared with neighbours")
ap.add_argument("--scale", type=float, default=2.0, help="upscale factor for each tile")
ap.add_argument("--crop", help="x0,y0,x1,y1 as fractions of width/height")
ap.add_argument("--out")
a = ap.parse_args()

img = Image.open(a.image).convert("RGB")
W, H = img.size
stem = os.path.splitext(os.path.basename(a.image))[0]
out = a.out or os.path.join(os.path.dirname(os.path.abspath(a.image)), f"{stem}_tiles")
os.makedirs(out, exist_ok=True)


def save(box, name):
    t = img.crop(box)
    t = t.resize((int(t.width * a.scale), int(t.height * a.scale)), Image.LANCZOS)
    p = os.path.join(out, name)
    t.save(p)
    print(f"{p}  (px {box[0]},{box[1]}-{box[2]},{box[3]})")


print(f"{a.image}: {W} x {H} px")
if a.crop:
    x0, y0, x1, y1 = (float(v) for v in a.crop.split(","))
    save((int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H)), f"{stem}_crop.png")
else:
    cols, rows = (int(v) for v in a.grid.lower().split("x"))
    tw, th = W / cols, H / rows
    ox, oy = tw * a.overlap, th * a.overlap
    for r in range(rows):
        for c in range(cols):
            box = (max(0, int(c * tw - ox)), max(0, int(r * th - oy)), min(W, int((c + 1) * tw + ox)), min(H, int((r + 1) * th + oy)))
            save(box, f"{stem}_r{r + 1}c{c + 1}.png")
