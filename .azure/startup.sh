#!/bin/bash
set -e

echo "=== CHECK DIST ==="

ls -la /home/site/wwwroot/artifacts/api-server || echo "NO API FOLDER"
ls -la /home/site/wwwroot/artifacts/api-server/dist || echo "NO DIST"

echo "=== FIND ENTRY FILE ==="
find /home/site/wwwroot -name "*.js"
find /home/site/wwwroot -name "*.mjs"

echo "=== START NODE ==="

node /home/site/wwwroot/artifacts/api-server/dist/index.js