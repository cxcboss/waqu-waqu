#!/usr/bin/env bash
# Builds the game and publishes dist/ to Cloudflare Pages (project waqu-waqu).
# Needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in the environment; never commit them.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${CLOUDFLARE_ACCOUNT_ID:?}" "${CLOUDFLARE_API_TOKEN:?}"
npm run build
npx --yes wrangler@3 pages deploy dist --project-name "${CF_PROJECT:-waqu-waqu}" --branch main --commit-dirty=true
