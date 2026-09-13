# One image recipe for the three Next.js apps, built from the monorepo root.
#
#   docker build -f apps/Dockerfile --build-arg APP=app .        # Hoy
#   docker build -f apps/Dockerfile --build-arg APP=affiliate .
#   docker build -f apps/Dockerfile --build-arg APP=admin .
#
# On Railway each service sets RAILWAY_DOCKERFILE_PATH=apps/Dockerfile and a
# service variable APP, which Railway passes as the build argument.
# Runtime variables: DATABASE_URL, SESSION_SECRET (and VAPID_PUBLIC_KEY for Hoy).

FROM node:24-slim AS build
ARG APP
RUN test -n "$APP" || (echo "set the APP build argument: app, affiliate or admin" && exit 1)
WORKDIR /repo
COPY . .
RUN npm ci --workspace "@leamington/${APP}" --include-workspace-root=false --no-audit --no-fund
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace "@leamington/${APP}" && mkdir -p "apps/${APP}/public"

FROM node:24-slim
ARG APP
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 APP=${APP}
WORKDIR /srv
# Standalone output holds only the traced server files and their node_modules.
COPY --from=build /repo/apps/${APP}/.next/standalone ./
COPY --from=build /repo/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=build /repo/apps/${APP}/public ./apps/${APP}/public
USER node
EXPOSE 3000
CMD ["sh", "-c", "exec node apps/$APP/server.js"]
