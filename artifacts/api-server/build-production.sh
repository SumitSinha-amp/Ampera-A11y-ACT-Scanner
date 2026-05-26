#!/bin/bash
set -e

# ── Install Chrome system dependencies ────────────────────────────────────────
# Puppeteer downloads its own Chrome binary but the Azure/Ubuntu deployment
# container ships without the graphics/sandbox libraries Chrome needs.
# Install the full set recommended by https://pptr.dev/troubleshooting
if command -v apt-get &>/dev/null; then
  echo "[build] Installing Chrome system dependencies..."
  apt-get update -qq 2>/dev/null || true
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    2>/dev/null || true
  echo "[build] Chrome system dependencies installed"
else
  echo "[build] apt-get not available — skipping Chrome dependency install (Nix env)"
fi

# ── Build the API server ───────────────────────────────────────────────────────
echo "[build] Building API server..."
pnpm --filter @workspace/api-server run build
echo "[build] Done"
