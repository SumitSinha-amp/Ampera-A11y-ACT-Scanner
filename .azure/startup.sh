#!/bin/bash
set -e

echo "=== STARTUP BEGIN ==="

export PUPPETEER_CACHE_DIR=/home/site/wwwroot/.cache/puppeteer

# ------------------------------------------------
# Install Chrome dependencies only if missing
# ------------------------------------------------

if ! ldconfig -p | grep -q libnss3; then
  echo "=== INSTALLING CHROME DEPENDENCIES ==="

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

else
  echo "=== CHROME DEPENDENCIES ALREADY INSTALLED ==="
fi

# ------------------------------------------------
# Install Chrome only if missing
# ------------------------------------------------

CHROME_EXE=$(find "$PUPPETEER_CACHE_DIR" -type f -name "chrome" 2>/dev/null | head -1)

if [ -n "$CHROME_EXE" ] && [ -x "$CHROME_EXE" ]; then
  echo "=== CHROME FOUND: $CHROME_EXE ==="
else
  echo "=== INSTALLING CHROME ==="

  cd /home/site/wwwroot/artifacts/api-server

  npx --no-install puppeteer browsers install chrome
fi

# ------------------------------------------------
# Debug logs
# ------------------------------------------------

echo "=== NODE VERSION ==="
node -v

echo "=== PORT ==="
echo $PORT

echo "=== STARTING NODE SERVER ==="

cd /home/site/wwwroot/artifacts/api-server

exec node dist/index.mjs