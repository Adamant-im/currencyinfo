# Build
FROM node:21-alpine as builder

WORKDIR /usr/src/currencyinfo

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && \
    pnpm install

COPY . .
RUN pnpm run build

# Production
FROM node:21-alpine

WORKDIR /usr/src/currencyinfo

COPY --from=builder /usr/src/currencyinfo/package.json \
  /usr/src/currencyinfo/pnpm-lock.yaml ./

RUN npm install -g pnpm && \
    pnpm install --only=production

COPY --from=builder /usr/src/currencyinfo/dist  ./dist
COPY --from=builder /usr/src/currencyinfo/config.default.jsonc \
  /usr/src/currencyinfo/.env \
  ./

EXPOSE 36661
CMD ["node", "dist/main"]
