#!/bin/bash
set -e

echo "Installing Chrome dependencies..."

apt-get update -y

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
  libxtst6 \
  fonts-liberation

echo "Dependencies installed."

echo "Starting app..."

echo "=== CHECK DIST ==="

ls -la /home/site/wwwroot/artifacts/api-server || echo "NO API FOLDER"
ls -la /home/site/wwwroot/artifacts/api-server/dist || echo "NO DIST"

echo "=== FIND ENTRY FILE ==="
find /home/site/wwwroot -name "*.js"
find /home/site/wwwroot -name "*.mjs"

echo "=== START NODE ==="

node /home/site/wwwroot/artifacts/api-server/dist/index.mjs