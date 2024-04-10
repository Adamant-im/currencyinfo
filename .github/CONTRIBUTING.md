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

Run MongoDB with Docker:

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

Install MongoDB and update `server.mongodb` value in `config.jsonc`. For example:

```json
{
  "server": {
    "port": 36661,
    "mongodb": {
      "port": 27017,
      "host": "127.0.0.1"
    }
  }
}
```

Start Currencyinfo dev server:

```
pnpm run start:dev
```
