#!/bin/bash
# docker-entrypoint.sh
#
# Dynamically resolves the Playwright Chromium binary path before starting
# the Node.js server.  The revision number inside /ms-playwright/ changes
# with every Playwright release — hardcoding it (e.g. chromium-1169) breaks
# the container whenever the base image is updated.
#
# Resolution order:
#   1. The highest-revision chrome binary found under /ms-playwright/
#      (covers mcr.microsoft.com/playwright:* base images)
#   2. Fall through to getChromiumPath() in scanner.ts which does its own
#      multi-location scan and retries if Chrome is temporarily unavailable.
set -e

SERVER_BUNDLE="/app/artifacts/api-server/dist/index.mjs"
if [ ! -s "$SERVER_BUNDLE" ]; then
  echo "=== FATAL: API server bundle is missing: $SERVER_BUNDLE ===" >&2
  exit 1
fi
CHROME=$(
  find /ms-playwright -type f \( -name "chrome" -o -name "chromium" -o -name "chromium-browser" \) \
       -perm /u+x 2>/dev/null \
  | sort -V \
  | tail -1
)

if [ -n "$CHROME" ] && [ -x "$CHROME" ]; then
  export PUPPETEER_EXECUTABLE_PATH="$CHROME"
  echo "=== Chrome resolved: $PUPPETEER_EXECUTABLE_PATH ==="
else
  echo "=== WARNING: No Chrome binary found under /ms-playwright — getChromiumPath() will scan on first launch ==="
fi

exec node artifacts/api-server/dist/index.mjs
