#!/usr/bin/env python3
"""Generate the 16:9 featuredImage for the ERC-8257 tool manifests.

Output: apps/audit/public/ai-tool/llx-banner.png (1920x1080).
Dark background, existing LLX logo (public/llx-logo.png), and the
"Liquid Logic X" wordmark with the X in a silver chrome gradient
(#f2f5f8 -> #c9d2dc -> #8e9aa6). Requires Pillow and the Inter font.
Run from the repo root: python3 apps/audit/scripts/gen-ai-tool-banner.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
BG = (10, 10, 15)  # matches apps/web/public/og.png background
STOPS = [(0.0, (0xF2, 0xF5, 0xF8)), (0.5, (0xC9, 0xD2, 0xDC)), (1.0, (0x8E, 0x9A, 0xA6))]
FONT = os.environ.get(
    "LLX_FONT", "/usr/share/fonts/truetype/sand-box/google/Inter/Inter-VariableFont_opsz,wght.ttf"
)
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
LOGO = os.path.join(ROOT, "public", "llx-logo.png")
OUT = os.path.join(ROOT, "apps", "audit", "public", "ai-tool", "llx-banner.png")


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient_color(t):
    for (t0, c0), (t1, c1) in zip(STOPS, STOPS[1:]):
        if t <= t1:
            return lerp(c0, c1, (t - t0) / (t1 - t0))
    return STOPS[-1][1]


def font(size):
    f = ImageFont.truetype(FONT, size)
    try:
        f.set_variation_by_axes([32, 800])  # opsz, wght
    except Exception:
        pass
    return f


def main():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    f = font(150)
    sub = font(40)
    words, x_char = "Liquid Logic ", "X"
    tagline = "Wallet audit  ·  Settlement proofs  ·  x402 on Base"
    logo_px, gap = 480, 90
    text_w = max(d.textlength(words + x_char, font=f), d.textlength(tagline, font=sub))
    lx = int((W - (logo_px + gap + text_w)) // 2)
    logo = Image.open(LOGO).convert("RGBA").resize((logo_px, logo_px), Image.LANCZOS)
    ly = (H - logo_px) // 2
    img.paste(logo, (lx, ly), logo)
    tx = lx + logo_px + gap
    asc, desc = f.getmetrics()
    ty = (H - (asc + desc)) // 2 - 40
    d.text((tx, ty), words, font=f, fill=(255, 255, 255))
    xw = d.textlength(words, font=f)

    # X in silver chrome vertical gradient
    xbox = d.textbbox((0, 0), x_char, font=f)
    mask = Image.new("L", (xbox[2] + 4, asc + desc), 0)
    ImageDraw.Draw(mask).text((0, 0), x_char, font=f, fill=255)
    grad = Image.new("RGB", mask.size)
    gd = ImageDraw.Draw(grad)
    top, bot = xbox[1], xbox[3]
    for y in range(mask.size[1]):
        t = min(max((y - top) / max(bot - top, 1), 0.0), 1.0)
        gd.line([(0, y), (mask.size[0], y)], fill=gradient_color(t))
    img.paste(grad, (int(tx + xw), ty), mask)

    d.text((tx + 6, ty + asc + desc + 30), tagline, font=sub, fill=(0xC9, 0xD2, 0xDC))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT, optimize=True)
    print(OUT, img.size)


if __name__ == "__main__":
    main()
