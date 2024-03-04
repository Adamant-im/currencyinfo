FROM node:21

WORKDIR /usr/src/currencyinfo

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./

RUN pnpm install

COPY . .

RUN pnpm run build

EXPOSE 36668

CMD ["node", "dist/main"]
