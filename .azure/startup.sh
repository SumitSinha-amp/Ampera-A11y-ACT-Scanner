#!/bin/bash
set -e

# Install Chromium (correct package)
apt-get update -qq
apt-get install -y -qq chromium

# Run app
node /home/site/wwwroot/artifacts/api-server/dist/index.mjs
