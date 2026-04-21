#!/bin/bash
set -e

echo "=== DEBUG START ==="
pwd
ls -la
ls -la /home/site/wwwroot/artifacts
ls -la /home/site/wwwroot/artifacts/api-server
ls -la /home/site/wwwroot/artifacts/api-server/dist

echo "=== STARTING NODE ==="

node /home/site/wwwroot/artifacts/api-server/dist/index.js
