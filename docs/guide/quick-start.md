# Quick start with Docker

This page gets a working instance running with the published container image. It takes one configuration file and two commands, and it needs no API key: the default source set is keyless.

For a source installation, a systemd unit, or a build from a checkout, see [installation](./installation.md).

## Requirements

- Docker 24 or newer with the Compose plugin
- MongoDB 6.0 or newer, either the Compose service below or an existing instance
- Outbound HTTPS access to the rate providers you enable

## 1. Create the configuration file

The image ships `config.default.jsonc` as a template but does not use it as a live configuration. Download the template and save it as `config.jsonc`:

```bash
curl -fsSL -o config.jsonc \
  https://raw.githubusercontent.com/Adamant-im/currencyinfo/master/config.default.jsonc
```

The defaults are a working configuration. The two values worth reviewing before the first start are:

```jsonc
{
  // Reachable from the container. "mongodb" is the Compose service name below;
  // use "host.docker.internal" or a real hostname for an external database
  "server": {
    "mongodb": { "host": "mongodb", "port": 27017, "db": "tickersdb" }
  },

  // Every currency you want rates expressed in
  "base_coins": ["USD", "RUB", "EUR", "CNY", "JPY", "BTC", "ETH"]
}
```

Everything else has a working default. See the [configuration reference](../reference/configuration.md) for the full option list.

## 2. Fix the file ownership

The container runs as the unprivileged `node` user with UID and GID `1000`, and a bind mount keeps its host ownership. A configuration file readable only by your own user is unreadable inside the container, and the process exits with `EACCES`.

```bash
sudo chown 1000:1000 config.jsonc
chmod 600 config.jsonc
```

Do this before the first start. On macOS and Windows the Docker Desktop file sharing layer remaps ownership, and the `chown` is unnecessary.

## 3. Start the service

### With Docker Compose

Save this as `docker-compose.yaml` next to `config.jsonc`:

```yaml
services:
  app:
    container_name: currencyinfo
    image: ghcr.io/adamant-im/currencyinfo:latest
    restart: always
    ports:
      - '36661:36661'
    depends_on:
      - mongodb
    volumes:
      - ./config.jsonc:/usr/src/currencyinfo/config.jsonc:ro
    networks:
      - app_network

  mongodb:
    container_name: mongodb
    image: 'mongo:8.0'
    restart: always
    volumes:
      - mongo_data:/data/db
    networks:
      - app_network
    command: --quiet --logpath /dev/null

networks:
  app_network:

volumes:
  mongo_data:
```

```bash
docker compose up -d
```

The repository ships the same file as [`docker-compose.prod.yaml`](https://github.com/Adamant-im/currencyinfo/blob/master/docker-compose.prod.yaml), with a commented local-build override for contributors.

### Without Compose

With an existing MongoDB reachable from the container:

```bash
docker run -d \
  --name currencyinfo \
  --restart always \
  -p 36661:36661 \
  -v "$(pwd)/config.jsonc:/usr/src/currencyinfo/config.jsonc:ro" \
  ghcr.io/adamant-im/currencyinfo:latest
```

Pin a version rather than `latest` for anything you depend on:

```bash
docker pull ghcr.io/adamant-im/currencyinfo:4.2.0
```

See [upgrade and rollback](./upgrading.md) for the tag policy.

## 4. Verify

Readiness first. `ready` turns `true` once a snapshot has been stored, which takes a few seconds after the first start:

```bash
curl -s http://localhost:36661/status
```

```json
{
  "success": true,
  "date": 1720472096540,
  "ready": true,
  "updating": false,
  "next_update": 1720472646060,
  "last_updated": 1720472000000,
  "version": "4.2.0"
}
```

Then a rate:

```bash
curl -s "http://localhost:36661/get?coin=BTC,ETH"
```

```json
{
  "success": true,
  "date": 1720472096540,
  "result": {
    "BTC/USD": 95120.45,
    "BTC/EUR": 87510.2,
    "ETH/USD": 3420.12
  },
  "last_updated": 1720472046060,
  "version": "4.2.0"
}
```

If `ready` stays `false`, read the logs:

```bash
docker compose logs -f app
```

See [troubleshooting](./troubleshooting.md) for the common causes.

## What you get by default

The shipped configuration enables five keyless sources and no authenticated one, so `minSources: 2` is satisfiable without signing up anywhere:

| Source | Covers | Keyless |
| --- | --- | --- |
| [CoinPaprika](../reference/sources/coinpaprika.md) | Crypto | Yes |
| [CoinLore](../reference/sources/coinlore.md) | Crypto | Yes |
| [Binance](../reference/sources/binance.md) | Crypto, spot market | Yes |
| [Currency API](../reference/sources/currency-api.md) | Fiat | Yes |
| [ExchangeRate-API](../reference/sources/exchangerate-api.md) | Fiat | Yes |

Two of them restrict what you may do with the rates. Read [source terms and redistribution](../reference/sources/#terms-and-redistribution) before serving these rates onwards to third parties.

CoinGecko, CoinMarketCap, and ExchangeRate.host are shipped disabled because they need a key. CryptoCompare is shipped disabled because its free tier was retired.

## Next steps

- [Configuration reference](../reference/configuration.md) for every option
- [Rate sources](../reference/sources/) to add or remove providers
- [Operations](./operations.md) for reverse proxy, TLS, logging, and health checks
- [Notifications](./notifications.md) to route alerts to Slack, Discord, or ADAMANT Messenger
