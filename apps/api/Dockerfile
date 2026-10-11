# syntax=docker/dockerfile:1
# Behind a TLS-intercepting proxy, pass its CA as an optional build secret:
#   docker build --secret id=npm_ca,src=/path/to/ca.pem ...
# LinkVault API. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t linkvault-api .

FROM node:22-alpine AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/extension/package.json apps/extension/

# Full install for the build (tsup, TypeScript sources of the shared package).
FROM manifests AS build
RUN --mount=type=secret,id=npm_ca,required=false \
    NODE_EXTRA_CA_CERTS=$([ -s /run/secrets/npm_ca ] && echo /run/secrets/npm_ca) \
    npm ci --workspace @linkvault/api
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @linkvault/api

# Production dependencies only.
FROM manifests AS deps
RUN --mount=type=secret,id=npm_ca,required=false \
    NODE_EXTRA_CA_CERTS=$([ -s /run/secrets/npm_ca ] && echo /run/secrets/npm_ca) \
    npm ci --workspace @linkvault/api --omit=dev --ignore-scripts && npm cache clean --force

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1
CMD ["node", "--enable-source-maps", "apps/api/dist/server.js"]
