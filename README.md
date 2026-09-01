# ![ADAMANT Currencyinfo logo](./.github/logo.png) ADAMANT Currencyinfo v4

_Reliable self-hosted crypto and fiat currency exchange rates service provider._

> Brought to you by the ADAMANT developer community and cryptofoundry.
> Custom crypto software, trading bots, payment systems and blockchain infrastructure — built for production. [Tell us what to build](https://adamant.business#contact).

```http
GET http://localhost:36661/get?coin=ADM,BTC,ETH
```

```json
{
  "success": true,
  "date": 1720472096540,
  "result": {
    "ADM/USD": 0.02978666,
    "ADM/RUB": 2.652919086307,
    "BTC/USD": 95120.45,
    "ETH/USD": 3420.12
  },
  "last_updated": 1720472046060,
  "version": "4.2.0"
}
```

## Features

- 🏠 **Self-hosted & Decentralized**: Run your own exchange rate provider without dependence on a single centralized service
- 🌐 **Multi-source Aggregation**: Collects, validates, and merges crypto and fiat rates across multiple public and authenticated providers
- 🔒 **Divergence & Outage Resilience**: Groups source rates by percentage threshold, drops inconsistent outliers, and raises configurable alerts
- ⚙️ **Configurable Strategies**: Choose resolution methods (`avg`, `min`, `max`, `priority`, `weight`) tailored to your deployment
- 📬 **Multi-channel Notifications**: Sends real-time operational alerts via Slack, Discord, and [ADAMANT Messenger](https://adamant.im)
- 📊 **Historical Rate Storage**: Persists historical rates in MongoDB for instant historical interval and point-in-time queries
- 🚀 **Lightweight & High Performance**: Built with NestJS, TypeScript, and SWC for minimal CPU and memory footprint
- 🛡️ **Zero Telemetry**: Fully private with zero third-party tracking or analytics

## Data Sources

![Data sources (light theme)](./.github/banner-light.png#gh-light-mode-only)
![Data sources (dark theme)](./.github/banner-dark.png#gh-dark-mode-only)

Currencyinfo integrates with multiple reliable market rate providers:

- 🦎 [CoinGecko](https://coingecko.com) — Broad cryptocurrency rates stably refreshed every 1 to 5 minutes
- 📈 [CoinMarketCap](https://coinmarketcap.com) — Fast-updating cryptocurrency quotes with flexible API tiers
- 💱 [CryptoCompare](https://cryptocompare.com) — Comprehensive crypto and fiat rate endpoints
- 💵 [Currency API](https://github.com/fawazahmed0/exchange-api) — Free, open-source fiat currency exchange rates
- 🏦 [ExchangeRate.host](https://exchangerate.host) — Global currency, forex, and precious metals exchange rates
- 🏛️ [MOEX](https://moex.com) — Moscow Exchange market data for reliable fiat currency pricing

## Prerequisites

- ⚡ **Node.js**: `v22` or higher
- 📦 **Package Manager**: `pnpm` (or `npm`)
- 🗄️ **Database**: `MongoDB 6.0+` or higher

## Quick Start

### 1. Clone repository and install dependencies

```bash
git clone https://github.com/Adamant-im/currencyinfo.git
cd currencyinfo
pnpm install --ignore-scripts
pnpm run deps:setup
```

### 2. Configure environment

Copy the default configuration template to `config.jsonc`:

```bash
cp config.default.jsonc config.jsonc
```

Edit `config.jsonc` to configure your MongoDB connection, base coins, active data sources, and optional notification webhooks.

Configuration is validated strictly at startup:

- `base_coins` must contain at least one symbol
- `rateDifferencePercentThreshold` and `groupPercentage` must be between `0` and `200`
- Set `rateDifferencePercentThreshold` to `200` to disable rate-distance splitting entirely; note that `groupPercentage` behaves the opposite way, and `200` there rejects every pair that splits into more than one group
- `refreshInterval`, when present, and `rateLifetime` must be greater than zero
- `minSources` must be a positive integer. It is an upper bound, not a guarantee: the effective
  threshold per pair is `min(minSources, number of enabled sources advertising that pair)`, so a pair
  offered by a single provider is still served from that one quote. Startup logs every pair whose
  coverage is below the configured value
- Optional source weights must be non-negative; zero gives a source no group weight
- Set `enabled` explicitly for authenticated sources; if it is omitted for a configured ExchangeRateHost or CoinMarketCap source, the source is treated as enabled and requires an API key

### 3. Build and run

```bash
# Development mode with watch
pnpm run start:dev

# Production build and run
pnpm run build
pnpm run start:prod
```

### Running with Docker

The production image runs as the unprivileged `node` user with UID and GID `1000`. On Linux, keep the configuration restricted while making it readable by that identity:

```bash
sudo chown 1000:1000 config.jsonc
chmod 600 config.jsonc
```

The same ownership requirement applies to `docker-compose.prod.yaml`, which mounts the file read-only but cannot change its ownership: run the `chown` above on the host before the first `docker compose up`, or the container exits with `EACCES`.

```bash
# Build Docker image
docker build -t adamant/currencyinfo .

# Run container
docker run -d \
  -p 36661:36661 \
  -v $(pwd)/config.jsonc:/usr/src/currencyinfo/config.jsonc:ro \
  --name currencyinfo \
  adamant/currencyinfo
```

## API Reference

### 1. Get Current Rates

Retrieves the latest merged exchange rates:

```http
GET /get
GET /get?coin=ADM
GET /get?coin=ADM,BTC,ETH
GET /get?rateLifetime=30
```

#### Query Parameters

- `coin` (string, optional) — Comma-separated list of coin symbols (for example, `ADM,BTC,USD`)
- `rateLifetime` (number, optional) — Maximum allowed age of cached rates in minutes (defaults to configured `rateLifetime`). The same window is used when enforcing the configured `minSources` requirement; pairs with too few fresh sources are omitted.

#### Response

```json
{
  "success": true,
  "date": 1720472096540,
  "result": {
    "ADM/USD": 0.02978666,
    "ADM/RUB": 2.652919086307,
    "BTC/USD": 95120.45
  },
  "last_updated": 1720472046060,
  "version": "4.2.0"
}
```

### 2. Get Historical Rates

Retrieves historical rate points stored in MongoDB:

Pair filters use the documented `BASE/QUOTE` order. Deployments upgrading from versions with the inverted historical filter must remove any client-side pair reversal workaround.

History snapshots are written only when at least one provider returns valid current data. A complete provider outage leaves a gap instead of recording cached rates as a new observation.

A snapshot is a complete view of every pair considered current, not only the pairs quoted in that cycle. Pairs whose last quote is still inside `rateLifetime` are carried into the snapshot, so a single snapshot timestamp can cover observations made at different times within that window. Pairs are dropped once their last quote falls outside `rateLifetime`.

When `timestamp` is combined with `coin`, the closest snapshot **that contains the requested pair** is returned, rather than the globally closest snapshot filtered afterwards. A request no longer comes back empty because the nearest snapshot happened not to carry that pair.

```http
GET /getHistory?coin=ADM&limit=10
GET /getHistory?coin=ADM/USD&from=1720400000&to=1720470000
GET /getHistory?timestamp=1720450000
```

#### Query Parameters

- `coin` (string, optional) — Coin symbol (`ADM`) or pair string (`ADM/USD`)
- `from` (number, optional) — Start UNIX timestamp (in seconds)
- `to` (number, optional) — End UNIX timestamp (in seconds)
- `timestamp` (number, optional) — Exact or closest historical UNIX timestamp (in seconds)
- `limit` (number, optional) — Maximum number of records to return (up to 100)

### 3. Service Status

Checks system readiness and next scheduled update time:

```http
GET /status
```

#### Response

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

- `ready` — whether a rate snapshot has been stored at least once since startup
- `updating` — whether a refresh cycle is running at this moment. It is not an overdue indicator: after a failed cycle the service is idle and reports `false` until the next scheduled attempt. Compare `next_update` against your own clock to detect an overdue schedule
- `next_update` — when the next refresh is scheduled, in milliseconds

### Upgrading

Every `tickers` index is now date-ordered, so `/getHistory` sorts are served by an index instead of a blocking in-memory sort. Three indexes replace three from v4.1.2:

| Created on first start | Superseded, not removed automatically |
| --- | --- |
| `{ base: 1, date: -1 }` | `{ base: 1 }` |
| `{ quote: 1, date: -1 }` | `{ quote: 1 }` |
| `{ base: 1, quote: 1, date: -1 }` | `{ base: 1, quote: 1 }` |

`{ date: 1 }` is unchanged.

Mongoose `autoIndex` creates missing indexes on connect but never drops undeclared ones, so a direct upgrade builds all three new indexes at startup and keeps all three old ones. On a large history collection that is real I/O and can delay readiness. Build the three new indexes out of band before deploying:

```js
db.tickers.createIndex({ base: 1, date: -1 }, { background: true });
db.tickers.createIndex({ quote: 1, date: -1 }, { background: true });
db.tickers.createIndex({ base: 1, quote: 1, date: -1 }, { background: true });
```

Once the new indexes are in place and the service has been validated, drop the three superseded ones to stop paying for their write amplification and disk:

```js
db.tickers.dropIndex('base_1');
db.tickers.dropIndex('quote_1');
db.tickers.dropIndex('base_1_quote_1');
```

## Development and Testing

```bash
# Run unit test suite
pnpm test

# Run tests with coverage report
pnpm run test:cov

# Run linter
pnpm run lint

# Check code formatting
pnpm run format:check

# Auto-format codebase
pnpm run format
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines, coding standards, and verification workflows.

## License

This project is licensed under the [GPL-3.0 License](LICENSE).
