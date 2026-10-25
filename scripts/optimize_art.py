#!/usr/bin/env python3
"""Turns the painted art in public/art (PNG/JPG, as exported by the art pipeline; old WebP files are not re-compressed: restore the PNG/JPG sources first) into the WebP files the game loads.

  python3 scripts/optimize_art.py            # converts every png/jpg in public/art, deletes the originals, rewrites manifest.json

Sprites are drawn at most ~1.1 px per design unit on phones (canvas is capped at dpr 2 and the design is 750 wide), so
anything stored above MAX_RATIO px per design unit is shrunk first. Needs Pillow with WebP support.
"""
import glob, json, os, sys
from PIL import Image

ART = os.path.join(os.path.dirname(__file__), '..', 'public', 'art')
SIZES = os.path.join(os.path.dirname(__file__), 'art_design_widths.json')  # sprite name -> width in design units
MAX_RATIO = 2.0
# full-screen backgrounds are shown about 1:1 on a phone, so they need far fewer pixels per design unit
BG_RATIO = 1.2
BG_MIN_WIDTH = 700
widths = json.load(open(SIZES)) if os.path.exists(SIZES) else {}

before = after = 0
names = []
for f in sorted(glob.glob(os.path.join(ART, '*.png')) + glob.glob(os.path.join(ART, '*.jpg'))):
    name, ext = os.path.splitext(os.path.basename(f))
    im = Image.open(f)
    w = widths.get(name)
    cap = BG_RATIO if (w and w >= BG_MIN_WIDTH) else MAX_RATIO
    if w and im.width > w * cap:
        k = w * cap / im.width
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    out = os.path.join(ART, name + '.webp')
    if ext == '.png':
        im.convert('RGBA').save(out, 'WEBP', quality=72, alpha_quality=80, method=6)
    else:
        im.convert('RGB').save(out, 'WEBP', quality=68, method=6)
    before += os.path.getsize(f)
    after += os.path.getsize(out)
    os.remove(f)
    names.append(name)
names = sorted(set(names) | {os.path.splitext(os.path.basename(f))[0] for f in glob.glob(os.path.join(ART, '*.webp'))})
json.dump(names, open(os.path.join(ART, 'manifest.json'), 'w'), indent=0)
print(f'{len(names)} images, {before/1e6:.1f} MB -> {after/1e6:.1f} MB')
