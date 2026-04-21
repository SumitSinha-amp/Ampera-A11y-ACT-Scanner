#!/bin/bash
set -e

apt-get update -qq
apt-get install -y -qq chromium

node /home/site/wwwroot/artifacts/api-server/dist/index.mjs
