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
cd "$tmp"
git init -q -b gh-pages
git add -A
git commit -q -m "部署 $rev"
git push -f "$url" gh-pages
rm -rf "$tmp"
