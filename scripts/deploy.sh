#!/usr/bin/env bash
# Builds the game and publishes dist/ to the gh-pages branch (GitHub Pages serves it).
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
rev=$(git rev-parse --short HEAD)
url=$(git remote get-url origin)
tmp=$(mktemp -d)
cp -r dist/. "$tmp"
touch "$tmp/.nojekyll"
# old preview links (all merged into the main build on 2026-10-22) send people to the live game
for d in preview preview-play preview-residents preview-home; do
  mkdir -p "$tmp/$d"
  printf '%s\n' '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="refresh" content="2;url=../"><title>蛙趣蛙趣</title><body style="font:18px sans-serif;padding:24px;background:#f6efe0">这个预览已经合并进正式版，正在跳转… <a href="../">没跳就点这里</a></body>' > "$tmp/$d/index.html"
done
cd "$tmp"
git init -q -b gh-pages
git add -A
git commit -q -m "部署 $rev"
git push -f "$url" gh-pages
rm -rf "$tmp"
