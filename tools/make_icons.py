"""Generates the PWA icons into public/: icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png.
Usage: python tools/make_icons.py [emoji] [color1] [color2] [output_dir]
Defaults: newspaper emoji, blue -> purple, ../public next to this script. Pass output_dir to build icons for another app.
Needs Pillow and Windows' Segoe UI Emoji font."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

emoji = sys.argv[1] if len(sys.argv) > 1 else "\U0001F4F0"
c1 = sys.argv[2] if len(sys.argv) > 2 else "#3b6fe0"
c2 = sys.argv[3] if len(sys.argv) > 3 else "#8a5cf0"
out = Path(sys.argv[4]).resolve() if len(sys.argv) > 4 else Path(__file__).resolve().parent.parent / "public"
out.mkdir(parents=True, exist_ok=True)
FONT = "C:/Windows/Fonts/seguiemj.ttf"


def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def gradient(size):
    a, b = hex_rgb(c1), hex_rgb(c2)
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / (2 * size - 2)
            px[x, y] = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
    return img


def glyph(size, scale):
    """The emoji drawn at `scale` of the canvas, centred on a transparent layer."""
    big = 136  # Segoe UI Emoji only renders colour glyphs at fixed sizes; draw large then resize
    font = ImageFont.truetype(FONT, big)
    layer = Image.new("RGBA", (big * 2, big * 2), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((big, big), emoji, font=font, anchor="mm", embedded_color=True)
    layer = layer.crop(layer.getbbox())
    target = int(size * scale)
    ratio = target / max(layer.size)
    return layer.resize((round(layer.width * ratio), round(layer.height * ratio)), Image.LANCZOS)


def icon(size, scale, rounded):
    img = gradient(size).convert("RGBA")
    g = glyph(size, scale)
    img.alpha_composite(g, ((size - g.width) // 2, (size - g.height) // 2))
    if rounded:  # 'any' icons get rounded corners; maskable/apple ones must be full-bleed squares
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=size // 5, fill=255)
        img.putalpha(mask)
    return img


icon(192, 0.62, True).save(out / "icon-192.png")
icon(512, 0.62, True).save(out / "icon-512.png")
icon(512, 0.46, False).save(out / "icon-maskable-512.png")  # glyph inside the 80% safe zone
icon(180, 0.62, False).convert("RGB").save(out / "apple-touch-icon.png")
print("wrote icons to", out)
