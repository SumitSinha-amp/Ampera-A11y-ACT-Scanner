# =========================
# Base Image
# =========================
FROM mcr.microsoft.com/playwright:v1.55.0-jammy

# =========================
# Install Chrome / Puppeteer Dependencies
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
# Copy Package Files
# =========================
COPY package.json pnpm-lock.yaml ./

# =========================
# Install PNPM
# =========================
RUN npm install -g pnpm

# =========================
# Install Dependencies
# =========================
RUN pnpm install --no-frozen-lockfile

# =========================
# Install Puppeteer Chrome
# =========================
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

RUN npx puppeteer browsers install chrome

# =========================
# Copy Source
# =========================
COPY . .

# =========================
# Build Application
# =========================
RUN pnpm --filter @workspace/api-server run build
RUN pnpm --filter @workspace/accessibility-scanner run build

# =========================
# Environment Variables
# =========================
ENV NODE_ENV=production
ENV PORT=8080

# =========================
# Expose Port
# =========================
EXPOSE 8080

# =========================
# Start App
# =========================
CMD ["node", "artifacts/api-server/dist/index.mjs"]