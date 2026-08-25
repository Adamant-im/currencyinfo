# Build
FROM node:22-alpine AS builder

WORKDIR /usr/src/currencyinfo

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm@10.11.0 && \
    pnpm install --ignore-scripts --frozen-lockfile && \
    pnpm run deps:setup

COPY . .
RUN pnpm run build

# Production
FROM node:22-alpine

WORKDIR /usr/src/currencyinfo

COPY --from=builder /usr/src/currencyinfo/package.json \
  /usr/src/currencyinfo/pnpm-lock.yaml ./

RUN npm install -g pnpm@10.11.0 && \
    pnpm install --prod --ignore-scripts --frozen-lockfile

COPY --from=builder /usr/src/currencyinfo/dist ./dist
COPY --from=builder /usr/src/currencyinfo/config.default.jsonc ./

EXPOSE 36661
CMD ["node", "dist/main"]
