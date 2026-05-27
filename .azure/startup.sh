#!/bin/bash
set -e

export PUPPETEER_CACHE_DIR=/home/site/wwwroot/.cache/puppeteer

# ── Chrome system dependencies ────────────────────────────────────────────────
# Azure App Service Linux only persists /home between container restarts.
# System packages (installed to /usr/lib etc.) are wiped every time the
# container starts, so apt-get MUST run unconditionally on every startup.
echo "=== INSTALL CHROME DEPENDENCIES ==="
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  libglib2.0-0 \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libpangocairo-1.0-0 \
  libpango-1.0-0 \
  libcairo2 \
  libatspi2.0-0 \
  libx11-6 \
  libxcb1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxtst6

# ── Chrome browser binary ─────────────────────────────────────────────────────
# $PUPPETEER_CACHE_DIR lives under /home/site/wwwroot which Azure DOES persist
# across container restarts. Only download Chrome when it is not already there.
CHROME_EXE=$(find "$PUPPETEER_CACHE_DIR" -type f -name "chrome" 2>/dev/null | head -1)
if [ -n "$CHROME_EXE" ] && [ -x "$CHROME_EXE" ]; then
  echo "=== CHROME ALREADY CACHED AT $CHROME_EXE - SKIPPING DOWNLOAD ==="
else
  echo "=== INSTALL CHROME ==="
  # Use the LOCAL puppeteer binary from api-server/node_modules — NOT bare npx.
  # npx run from /home/site/wwwroot cannot find puppeteer (pnpm scopes it to
  # artifacts/api-server/node_modules) so it re-downloads the entire puppeteer
  # package (~100 packages, ~60s) before even starting the Chrome download.
  LOCAL_PUPPETEER="/home/site/wwwroot/artifacts/api-server/node_modules/.bin/puppeteer"
  if [ -f "$LOCAL_PUPPETEER" ]; then
    "$LOCAL_PUPPETEER" browsers install chrome
  else
    echo "(local binary not found — falling back to npx from api-server dir)"
    (cd /home/site/wwwroot/artifacts/api-server && npx --no-install puppeteer browsers install chrome) || \
    (cd /home/site/wwwroot/artifacts/api-server && npx puppeteer browsers install chrome)
  fi
fi

echo "Starting app..."

echo "=== CHECK DIST ==="
ls -la /home/site/wwwroot/artifacts/api-server || echo "NO API FOLDER"
ls -la /home/site/wwwroot/artifacts/api-server/dist || echo "NO DIST"

echo "=== FIND ENTRY FILE ==="
find /home/site/wwwroot -name "*.js"
find /home/site/wwwroot -name "*.mjs"

echo "=== START NODE ==="
node /home/site/wwwroot/artifacts/api-server/dist/index.mjs
