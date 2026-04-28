FROM node:20-slim

RUN apt-get update && apt-get install -y \
    chromium \
    fonts-noto-cjk \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY server/package*.json ./
RUN npm install
COPY server/ ./

EXPOSE 3000
CMD ["node", "index.js"]
