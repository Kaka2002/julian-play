FROM node:20-bookworm-slim

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS http://localhost:${PORT:-10000}/health || exit 1

CMD ["npm", "start"]
