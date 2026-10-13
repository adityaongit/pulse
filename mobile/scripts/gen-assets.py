#!/usr/bin/env python3
"""Draws the source images in mobile/assets that `pnpm assets` (@capacitor/assets) turns into the Android and iOS icons and
launch screens. Same mark and colours as scripts/gen-pwa-assets.py at the repo root. Run: python3 scripts/gen-assets.py (needs Pillow)."""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "assets")
DARK = (16, 21, 24)
GREEN, BLUE = (0, 241, 159), (31, 160, 240)
SS = 2

def mark(img, cx, cy, height):
    u = height / 15
    d = ImageDraw.Draw(img)
    for x, y, color in ((6.9, 4.5, GREEN), (12.9, 8.5, BLUE)):
        x0, y0 = cx + (x - 12) * u, cy + (y - 12) * u
        d.rounded_rectangle([x0, y0, x0 + 4.2 * u, y0 + 11 * u], radius=2.1 * u, fill=color)

def render(size, bg, mark_h, name, mode="RGB"):
    img = Image.new(mode, (size * SS, size * SS), bg)
    if mark_h:
        mark(img, size * SS / 2, size * SS / 2, mark_h * SS)
    img.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name), optimize=True)

os.makedirs(OUT, exist_ok=True)
# iOS and legacy Android: the full square, which the OS rounds itself.
render(1024, DARK, 1024 * 0.42, "icon-only.png")
# Android adaptive icon: the launcher shows the middle 72 of 108 dp, so the mark stays well inside it.
render(1024, (0, 0, 0, 0), 1024 * 0.34, "icon-foreground.png", "RGBA")
render(1024, DARK, 0, "icon-background.png")
# Launch screens are dark in both schemes: the app's own ground is #101518 either way until the page paints.
render(2732, DARK, 2732 * 0.1, "splash.png")
render(2732, DARK, 2732 * 0.1, "splash-dark.png")
