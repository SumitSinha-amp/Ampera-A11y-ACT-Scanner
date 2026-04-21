#!/bin/bash
set -e

echo "Starting app..."
pwd
ls -la

apt-get update -qq
apt-get install -y -qq chromium

echo "Running node app..."
node /home/site/wwwroot/artifacts/api-server/dist/index.mjs
