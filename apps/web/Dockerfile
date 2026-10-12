# syntax=docker/dockerfile:1
# Behind a TLS-intercepting proxy, pass its CA as an optional build secret:
#   docker build --secret id=npm_ca,src=/path/to/ca.pem ...
# LinkVault web app as static files behind nginx. Build from the repository root:
#   docker build -f apps/web/Dockerfile --build-arg VITE_API_URL=http://localhost:4000 -t linkvault-web .

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/extension/package.json apps/extension/
RUN --mount=type=secret,id=npm_ca,required=false \
    NODE_EXTRA_CA_CERTS=$([ -s /run/secrets/npm_ca ] && echo /run/secrets/npm_ca) \
    npm ci --workspace @linkvault/web
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
ARG VITE_API_URL=http://localhost:4000
ARG VITE_EXTENSION_DOWNLOAD_URL=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_EXTENSION_DOWNLOAD_URL=$VITE_EXTENSION_DOWNLOAD_URL
RUN npm run build -w @linkvault/web

FROM nginx:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
