"""Derive the transparent app logos from the supplied artwork.

    python3 brand/build-logos.py
"""
from PIL import Image

SRC = "brand/luca-logo-source.webp"
NAVY_LUM = 30  # luminance at or below this is fully opaque mark

src = Image.open(SRC).convert("RGB")
w, h = src.size
px = src.load()

lut = []
for L in range(256):
    a = (255 - L) * 255 // (255 - NAVY_LUM)
    lut.append(255 if a > 255 else (0 if a < 10 else a))


def build(rgb, path):
    out = Image.new("RGBA", (w, h))
    o = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            o[x, y] = (*rgb, lut[(299 * r + 587 * g + 114 * b) // 1000])
    out.save(path, optimize=True)
    print("wrote", path)


build((6, 26, 76), "public/luca-logo.png")
build((255, 255, 255), "public/luca-logo-white.png")
