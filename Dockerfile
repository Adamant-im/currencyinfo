# syntax=docker/dockerfile:1

# Build
#
# Pinned to the build platform rather than the target one: `nest build` emits plain JavaScript,
# so the compiled output is architecture independent and cross-building it under emulation would
# only cost time. Only the runtime stage below is built per target platform.
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder

WORKDIR /usr/src/currencyinfo

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm@10.11.0 && \
    pnpm install --ignore-scripts --frozen-lockfile && \
    pnpm run deps:setup

COPY . .
RUN pnpm run build

# Production
FROM node:22-alpine

# Populated by the release workflow. `docker build` without them still produces a working image,
# it just carries empty version, revision, and creation labels.
ARG VERSION=""
ARG REVISION=""
ARG CREATED=""

LABEL org.opencontainers.image.title="Currencyinfo" \
      org.opencontainers.image.description="Universal self-hosted crypto and fiat exchange rates service aggregating multiple sources behind one REST API" \
      org.opencontainers.image.url="https://currencyinfo.dev" \
      org.opencontainers.image.documentation="https://currencyinfo.docs.adamant.im" \
      org.opencontainers.image.source="https://github.com/Adamant-im/currencyinfo" \
      org.opencontainers.image.vendor="ADAMANT community developers" \
      org.opencontainers.image.licenses="GPL-3.0" \
      org.opencontainers.image.base.name="docker.io/library/node:22-alpine" \
      org.opencontainers.image.version="$VERSION" \
      org.opencontainers.image.revision="$REVISION" \
      org.opencontainers.image.created="$CREATED"

WORKDIR /usr/src/currencyinfo

COPY --from=builder /usr/src/currencyinfo/package.json \
  /usr/src/currencyinfo/pnpm-lock.yaml ./

RUN npm install -g pnpm@10.11.0 && \
    pnpm install --prod --ignore-scripts --frozen-lockfile

COPY --from=builder /usr/src/currencyinfo/dist ./dist
COPY --from=builder /usr/src/currencyinfo/config.default.jsonc ./

# `config.jsonc` is deliberately absent: configuration is mounted at runtime so that no image
# layer can ever carry an API key, a webhook URL, or a notification passphrase.
RUN mkdir -p ./logs && chown node:node ./logs

USER node

EXPOSE 36661

# No HEALTHCHECK is declared here on purpose: the listen port is a configuration value
# (`server.port`), so a hardcoded probe would report a healthy service as unhealthy on any
# custom port. Declare one in your Compose file instead, where the port is known:
# https://currencyinfo.docs.adamant.im/guide/operations#health-and-readiness
CMD ["node", "dist/main"]
