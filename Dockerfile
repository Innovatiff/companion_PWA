# Ingest worker.
#
# This lives at the REPOSITORY ROOT on purpose. Railway's build detection runs
# in the repo root unless a Root Directory is configured, and relying on that
# setting cost five failed deploys -- each one reporting only "Railpack could not
# determine how to build the app", which is detection never finding a Dockerfile
# rather than anything wrong with the build.
#
# A Dockerfile here is found with no Railway configuration at all. The build
# context is the repo root, so every COPY is repo-root relative.

FROM node:22-slim

WORKDIR /app

# Dependencies first, so a code change does not reinstall them.
# No glob on the lockfile: if it is missing this COPY fails loudly rather than
# silently falling back to an unpinned `npm install`. `npm ci` then fails if the
# lock and package.json have drifted, instead of quietly resolving something
# different from what was tested.
COPY leamington/services/ingest/package.json leamington/services/ingest/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY leamington/services/ingest/src    ./src
COPY leamington/services/ingest/verify ./verify
COPY leamington/services/ingest/data   ./data

ENV NODE_ENV=production
# Serves /health for the platform health check.
ENV PORT=3000
EXPOSE 3000

CMD ["node", "src/index.mjs"]
