#!/bin/bash
set -e

# Install Chromium if not already present
if ! command -v chromium-browser &>/dev/null; then
  apt-get update -qq
  apt-get install -y -qq chromium-browser
fi

# Run the app
node /home/site/wwwroot/artifacts/api-server/dist/index.mjs