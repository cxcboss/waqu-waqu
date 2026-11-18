#!/usr/bin/env bash
# Build the trial version and update the current GitHub Pages branch.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build:trial
rev=$(git rev-parse --short HEAD)
tmp=$(mktemp -d)
cleanup() {
  git worktree remove --force "$tmp/pages"
  rmdir "$tmp"
}
git fetch origin refs/heads/gh-pages
git worktree add --detach "$tmp/pages" FETCH_HEAD
trap cleanup EXIT
# Keep old preview links and hashed scripts used by an already open page.
rsync -a dist/ "$tmp/pages/"
touch "$tmp/pages/.nojekyll"
git -C "$tmp/pages" add -A
if ! git -C "$tmp/pages" diff --cached --quiet; then
  git -C "$tmp/pages" commit -m "部署试玩版 $rev"
  git -C "$tmp/pages" push origin HEAD:refs/heads/gh-pages
fi
