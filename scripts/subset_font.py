#!/usr/bin/env python3
"""Builds small LXGW WenKai (霞鹜文楷) fonts that contain only the characters the game uses.

The npm package `lxgw-wenkai-webfont` ships the font split into ~100 woff2 pieces.
This script scans src/ for every character, picks the pieces that cover them,
subsets each piece and merges them into public/fonts/wk-regular.woff2 and wk-bold.woff2.

Run it again whenever new Chinese text is added:  npm run font
Needs: pip install fonttools brotli
"""
import io
import logging
import os
import re
import sys
import tarfile
import tempfile
import urllib.request

from fontTools import subset
from fontTools.merge import Merger
from fontTools.ttLib import TTFont

logging.getLogger('fontTools').setLevel(logging.ERROR)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PKG_URL = 'https://registry.npmjs.org/lxgw-wenkai-webfont/-/lxgw-wenkai-webfont-1.7.0.tgz'
CACHE = os.path.join(tempfile.gettempdir(), 'lxgw-wenkai-webfont')


def ensure_package():
    if os.path.isdir(os.path.join(CACHE, 'package')):
        return os.path.join(CACHE, 'package')
    os.makedirs(CACHE, exist_ok=True)
    print('downloading', PKG_URL)
    data = urllib.request.urlopen(PKG_URL).read()
    with tarfile.open(fileobj=io.BytesIO(data)) as tf:
        tf.extractall(CACHE)
    return os.path.join(CACHE, 'package')


def used_chars():
    chars = set(chr(c) for c in range(0x20, 0x7F))
    chars.update('，。、：；！？…—·“”‘’（）《》「」+-%/×→←↑↓★☆')
    for base, _, files in os.walk(os.path.join(ROOT, 'src')):
        for f in files:
            if f.endswith('.ts'):
                chars.update(open(os.path.join(base, f), encoding='utf-8').read())
    return {c for c in chars if ord(c) >= 0x20}


def parse_ranges(css_text):
    pieces = []
    for block in re.findall(r'@font-face\s*{(.*?)}', css_text, re.S):
        src = re.search(r"url\('\./(files/[^']+)'\)", block).group(1)
        ranges = []
        for part in re.search(r'unicode-range:\s*([^;}]+)', block).group(1).split(','):
            part = part.strip()[2:]
            if '-' in part:
                a, b = part.split('-')
                ranges.append((int(a, 16), int(b, 16)))
            else:
                ranges.append((int(part, 16), int(part, 16)))
        pieces.append((src, ranges))
    return pieces


def build(pkg, weight, out_name, chars):
    pieces = parse_ranges(open(os.path.join(pkg, f'lxgwwenkai-{weight}.css'), encoding='utf-8').read())
    codes = {ord(c) for c in chars}
    tmp = tempfile.mkdtemp()
    parts = []
    for src, ranges in pieces:
        need = {c for c in codes if any(a <= c <= b for a, b in ranges)}
        if not need:
            continue
        font = TTFont(os.path.join(pkg, src))
        opts = subset.Options()
        opts.layout_features = ['*']
        opts.notdef_outline = True
        opts.name_IDs = ['*']
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=need)
        sub.subset(font)
        font.flavor = None
        p = os.path.join(tmp, f'{len(parts)}.ttf')
        font.save(p)
        parts.append(p)
    print(f'{weight}: {len(codes)} chars from {len(parts)} pieces')
    merged = Merger().merge(parts)
    merged.flavor = 'woff2'
    out = os.path.join(ROOT, 'public', 'fonts', out_name)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    merged.save(out)
    print('wrote', out, os.path.getsize(out) // 1024, 'KB')


if __name__ == '__main__':
    pkg = sys.argv[1] if len(sys.argv) > 1 else ensure_package()
    chars = used_chars()
    build(pkg, 'regular', 'wk-regular.woff2', chars)
    build(pkg, 'bold', 'wk-bold.woff2', chars)
