#!/usr/bin/env bash
#
# sentry-release.sh
#
# Runs after `npm run build` and before `wrangler deploy`. Two jobs:
#
#   1. Upload source maps to Sentry so frontend stack traces de-minify.
#   2. Strip those maps out of build/ so they are NOT served to the public.
#
# Job 2 runs whether or not job 1 does, and that is the important one.
# rsbuild is configured with `hidden-source-map`, which only omits the
# //# sourceMappingURL comment — it still writes the .map files, and
# `[assets] directory = "./build"` in wrangler.toml deployed every one of
# them. Before this script, the full unminified source (sourcesContent: true,
# 77 files) was downloadable from https://tallyreading.uk/static/js/*.js.map
# while Sentry had no maps at all — the worst of both worlds.
#
# Requires SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT to upload.
# Without them the build still succeeds and the maps are still stripped;
# you just get minified traces in Sentry, and a warning saying so.

set -euo pipefail

BUILD_DIR="build"
JS_DIR="${BUILD_DIR}/static/js"
VERSION="$(node -p "require('./package.json').version")"
RELEASE="tally-reading@${VERSION}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [ ! -d "$BUILD_DIR" ]; then
  echo -e "${RED}✗ '${BUILD_DIR}' not found — run 'npm run build' first.${NC}" >&2
  exit 1
fi

if [ -n "${SENTRY_AUTH_TOKEN:-}" ] && [ -n "${SENTRY_ORG:-}" ] && [ -n "${SENTRY_PROJECT:-}" ]; then
  echo -e "${YELLOW}→ Uploading source maps to Sentry for ${RELEASE}...${NC}"

  # A Sentry hiccup must never block a production deploy, so the upload is
  # best-effort — but it reports loudly rather than failing silently.
  upload_ok=true
  {
    # `inject` stamps matching debug IDs into the JS and its map. That is what
    # lets Sentry pair them after we delete the maps below; it needs no
    # release/dist/url-prefix matching, which is the fragile old approach.
    npx sentry-cli sourcemaps inject "$JS_DIR" &&
      npx sentry-cli sourcemaps upload --release "$RELEASE" "$JS_DIR"
  } || upload_ok=false

  if [ "$upload_ok" = true ]; then
    # Release + deploy marker: lets Sentry mark issues as "first seen in
    # 3.114.0" and flag regressions against a specific deploy.
    npx sentry-cli releases finalize "$RELEASE" || true
    npx sentry-cli releases deploys "$RELEASE" new --env "${SENTRY_ENVIRONMENT:-production}" || true
    echo -e "${GREEN}✓ Source maps uploaded and ${RELEASE} finalized.${NC}"
  else
    echo -e "${RED}✗ Source map upload FAILED for ${RELEASE}.${NC}" >&2
    echo -e "${RED}  Deploy continues, but traces for this release will be minified.${NC}" >&2
  fi
else
  echo -e "${YELLOW}⚠ SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT not set —${NC}"
  echo -e "${YELLOW}  skipping source map upload. Sentry traces for ${RELEASE}${NC}"
  echo -e "${YELLOW}  will be minified. See docs/sentry.md to set this up.${NC}"
fi

# Always strip maps from the deploy bundle — uploaded or not, they must not ship.
MAP_COUNT="$(find "$BUILD_DIR" -name '*.map' | wc -l | tr -d ' ')"
find "$BUILD_DIR" -name '*.map' -delete
echo -e "${GREEN}✓ Stripped ${MAP_COUNT} source map(s) from ${BUILD_DIR} — not deployed.${NC}"
