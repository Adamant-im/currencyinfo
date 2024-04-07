## Development setup

## Using Docker

Install dependencies:

```
pnpm install
```

Copy the default config file:

```
cp config.default.jsonc config.jsonc
```

Run Redis and MongoDB with Docker:

```
docker compose up
```

Start Currencyinfo dev server:

```
pnpm run start:dev
```

## Without Docker

Install dependencies:

```
pnpm install
```

Copy the default config file:

```
cp config.default.jsonc config.jsonc
```

Install Redis and MongoDB. Update `server.mongodb` and `server.redis` values in `config.jsonc`. For example:

```json
{
  "server": {
    "port": 36661,
    "mongodb": {
      "port": 27017,
      "host": "127.0.0.1"
    },
    "redis": {
      "port": 6379,
      "host": "localhost"
    }
  }
}
```

Start Currencyinfo dev server:

```
pnpm run start:dev
```
