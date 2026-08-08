FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl python3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts

COPY . .
RUN node scripts/ensure-ytdlp.js

ENV NODE_ENV=production
ENV VM_CLOUD=1
ENV PORT=3000
EXPOSE 3000

CMD ["node", "scripts/serve-mobile.js"]
