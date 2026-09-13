# Ingest worker. Long-lived process running the scheduler; not a serverless fit
# (alerts poll every 15 min = 96 runs/day, and scrapes are long-running).
FROM node:22-slim

WORKDIR /app

# Dependencies first, so a code change does not reinstall them.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src
COPY verify ./verify
COPY data ./data

ENV NODE_ENV=production
# Optional: serves /health for the platform's health check.
ENV PORT=3000
EXPOSE 3000

CMD ["node", "src/index.mjs"]
