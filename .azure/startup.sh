#!/bin/bash
set -e

export PUPPETEER_CACHE_DIR=/home/site/wwwroot/.cache/puppeteer

# ── Chrome system dependencies ────────────────────────────────────────────────
# /home persists across Azure container restarts, so libgbm stays installed.
# Skip the full apt-get run when the sentinel library is already present.
if ldconfig -p 2>/dev/null | grep -q libgbm; then
  echo "=== CHROME DEPENDENCIES ALREADY INSTALLED - SKIPPING ==="
else
  echo "=== INSTALL CHROME DEPENDENCIES ==="
  apt-get update
  apt-get install -y \
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
fi

# ── Chrome browser binary ─────────────────────────────────────────────────────
# $PUPPETEER_CACHE_DIR lives under /home/site/wwwroot which Azure persists
# across container restarts. Only download Chrome when it is not already there.
CHROME_EXE=$(find "$PUPPETEER_CACHE_DIR" -type f -name "chrome" 2>/dev/null | head -1)
if [ -n "$CHROME_EXE" ] && [ -x "$CHROME_EXE" ]; then
  echo "=== CHROME ALREADY CACHED AT $CHROME_EXE - SKIPPING DOWNLOAD ==="
else
  echo "=== INSTALL CHROME ==="
  # Use the LOCAL puppeteer binary from api-server/node_modules — NOT bare npx.
  # npx run from /home/site/wwwroot cannot find puppeteer (pnpm scopes it to
  # artifacts/api-server/node_modules) so it re-downloads the entire puppeteer
  # package (~100 packages, ~60 s) before even starting the Chrome download.
  LOCAL_PUPPETEER="/home/site/wwwroot/artifacts/api-server/node_modules/.bin/puppeteer"
  if [ -f "$LOCAL_PUPPETEER" ]; then
    "$LOCAL_PUPPETEER" browsers install chrome
  else
    # Fallback: cd into api-server so npx resolves from the local node_modules
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
