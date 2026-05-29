# =========================
# Base Image
# =========================
FROM mcr.microsoft.com/playwright:v1.55.0-jammy

# =========================
# Install Extra Chrome Dependencies
# =========================
RUN apt-get update -y && \
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
    fonts-liberation \
    ca-certificates \
    wget \
    gnupg \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# =========================
# App Directory
# =========================
WORKDIR /app

# =========================
# Copy Workspace
# =========================
COPY . .

# =========================
# Install PNPM
# =========================
RUN npm install -g pnpm

# =========================
# Environment Variables
# =========================
ENV CI=false
ENV PNPM_BUILD_POLICY=allow
ENV PNPM_IGNORE_BUILD_SCRIPTS=false
ENV PNPM_ALLOW_NON_APPLIED_PATCHES=true
ENV npm_config_allow_build=*

ENV PUPPETEER_SKIP_DOWNLOAD=true
# ENV PUPPETEER_EXECUTABLE_PATH=/ms-playwright/chromium-1169/chrome-linux/chrome
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# =========================
# Install Dependencies
# =========================
RUN pnpm install --no-frozen-lockfile --unsafe-perm --ignore-scripts

# =========================
# Rebuild Required Packages
# =========================
RUN pnpm rebuild esbuild puppeteer core-js @clerk/shared

# =========================
# Install Puppeteer Chrome
# =========================
# RUN npx puppeteer browsers install chrome

# =========================
# Build Applications
# =========================
RUN pnpm --filter @workspace/api-server build

RUN pnpm --filter @workspace/accessibility-scanner build

# =========================
# Expose Port
# =========================
EXPOSE 8080

# =========================
# Start App
# =========================
#CMD ["node", "artifacts/api-server/dist/index.mjs"]
CMD ["/app/docker-entrypoint.sh"]