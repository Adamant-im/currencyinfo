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

Currencyinfo integrates with multiple reliable market rate providers.

Enabled by default, keyless, and requiring no signup:

- 🌶️ [CoinPaprika](https://coinpaprika.com) — Broad cryptocurrency rates, 20,000 calls per month and 10 requests per second
- 🪙 [CoinLore](https://coinlore.com) — Broad cryptocurrency rates, the whole coin set in a single request per cycle
- 🟡 [Binance](https://binance.com) — Public spot market data from an exchange rather than an aggregator
- 💵 [Currency API](https://github.com/fawazahmed0/exchange-api) — Free, open-source fiat currency exchange rates
- 💶 [ExchangeRate-API](https://www.exchangerate-api.com) — Keyless fiat endpoint covering 166 currencies, updated daily

Disabled by default because they need a key:

- 🦎 [CoinGecko](https://coingecko.com) — Broad cryptocurrency rates stably refreshed every 1 to 5 minutes. The free Demo plan key is required, see [Enabling CoinGecko](#enabling-coingecko).
- 📈 [CoinMarketCap](https://coinmarketcap.com) — Fast-updating cryptocurrency quotes with flexible API tiers
- 🏦 [ExchangeRate.host](https://exchangerate.host) — Global currency, forex, and precious metals exchange rates
- 🏛️ [MOEX](https://moex.com) — Moscow Exchange market data for fiat currency pricing. Disabled because USD and EUR trading has been prohibited there since June 2024.

Deprecated:

- 💱 [CryptoCompare](https://developers.coindesk.com), now CoinDesk Data — Comprehensive crypto and fiat rate endpoints. The free tier was retired on 21 May 2026 and `min-api.cryptocompare.com` answers `401` without a paid subscription, so the source is disabled by default. The connector is kept for subscribers, see [Deprecated sources](#deprecated-sources).

The default configuration therefore provides three keyless crypto sources and two keyless fiat sources, so `minSources: 2` is satisfiable out of the box without any API key.

### Source terms and redistribution

Keyless access is not the same as permission to republish the data. Both keyless sources enabled by default restrict what an operator may do with their rates, and the restriction depends on how the instance is used rather than on whether a key is paid for.

| Source | Private or development instance, rates consumed by you | Public or commercial instance serving these rates onwards |
| --- | --- | --- |
| [CoinPaprika](https://docs.coinpaprika.com/api-plans) | Permitted on the free plan, which is marked "Personal" usage | Redistribution is offered on the Enterprise plan only. The paid Starter through Ultimate plans allow commercial usage without granting redistribution |
| [ExchangeRate-API](https://www.exchangerate-api.com/docs/free) | Permitted, and attribution is required | Not permitted. Contact the provider for written permission |

### Source quotas and behaviour

- CoinPaprika's free plan is keyless and allows 20,000 calls per month at 10 requests per second. A refresh cycle costs one ranked bulk call plus one call per admitted coin that ranks outside `coinpaprika.bulk_limit`, which is two calls per cycle with the shipped defaults. That is ~8,900 calls in a 31-day month at the default `refreshInterval` of 10 minutes. The quota therefore bounds the interval: two calls per cycle exhaust it below ~4.5 minutes, so keep `refreshInterval` at 5 or more, raise `coinpaprika.bulk_limit` above the rank of every configured ID to get back to a single call per cycle, or disable the source.
- CoinPaprika admits all bulk-range coins at startup and up to `coinpaprika.max_individual_requests` out-of-range or unranked coins, preserving configuration order with explicit IDs before symbols. It excludes excess coins from requests and source coverage for the run and warns once with their names. Raise the cap or adjust `coinpaprika.bulk_limit`, then restart to reconsider them. A zero cap keeps only bulk-range coins and disables the source for the run if none remain. Temporary gaps in a bulk response still use capped fallback requests without removing advertised coins.
- CoinLore publishes an open API that requires no registration and no key. It states no strict rate limit and recommends around one request per second, which a single multi-ID request per cycle stays far below.
- Binance geo-blocks some regions with HTTP `451`. The connector reports the block once, disables itself for the run, and the remaining sources keep serving. Restarting the service re-probes availability.
- Binance quotes no direct USD pairs. Rates are requested against `binance.quote_asset` (`USDT` by default) and served as `USD`, so a depeg of the quote asset shifts every Binance rate by the depeg magnitude. `binance.quote_asset` only accepts USD-pegged assets, because the connector relabels the quote as USD instead of converting it
- Whether a depeg raises an alert depends on your thresholds and source mix, and the default settings do not catch a small one. Rates are grouped by `rateDifferencePercentThreshold`, computed as the difference over the mean, so at the default `25` a Binance quote stays in the same group as the honest ones until the peg falls to roughly `0.78`. Below that the Binance quotes split off, `groupPercentage` decides whether the divergence is reported, and `strategy` resolves the pair from the dominant group. Lower `rateDifferencePercentThreshold` if you need a tighter bound, and keep at least two non-Binance sources for every pair Binance quotes
- `USDT/USD` and `USDC/USD` stay in the aggregator source defaults, so the peg itself is visible in the served data whatever the grouping decides.
- Coin discovery runs once per start, not per cycle. CoinPaprika always downloads its `/v1/coins` directory (~1.4 MB gzipped), including when only `coinpaprika.ids` are configured, to resolve symbols and ranks. CoinLore downloads its `/api/assets/` directory (~0.4 MB gzipped) only when symbols remain unresolved; a `coinlore.ids` map that covers every configured symbol skips that request entirely. Binance validates its markets with one small `exchangeInfo` call.
- The default coin lists cover every coin in `adamant-wallets` [`assets/general`](https://github.com/Adamant-im/adamant-wallets/tree/master/assets/general) that ADAMANT clients quote as a currency of its own: `ADM`, `BTC`, `ETH`, `BNB`, `DOGE`, `DASH`, `USDT` and `USDC`. `XRP`, `SOL`, `ADA`, `TRX` and `LTC` are added on top because every crypto source quotes them, which gives the divergence check enough overlap to be meaningful. ERC-20 tokens listed in `adamant-wallets` are not enabled by default; add them to the per-source coin lists when an operator needs them.

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
- Set `enabled` explicitly for authenticated sources; if it is omitted for a configured ExchangeRateHost, CoinMarketCap, CoinGecko or CryptoCompare source, the source is treated as enabled and requires an API key
- `binance.coins` must not contain `binance.quote_asset`, because there is no market of an asset against itself
- The template ships readable placeholders in every `api_key` and in `notify.adamantPassphrase` so you can see where each credential goes. They are treated as no credential at all: enabling a source while its placeholder is still in place fails at startup with the message naming that source, instead of failing on every request afterwards. Placeholders from earlier templates and from Currencyinfo v1 are recognized too

#### Enabling CoinGecko

The keyless CoinGecko plan is throttled to 5-15 calls per minute and rate limits unpredictably, so it is disabled by default. The free Demo plan gives 10,000 calls per month at 100 calls per minute and needs no credit card:

1. Create a key at [the CoinGecko developer dashboard](https://www.coingecko.com/en/developers/dashboard)
2. Put it in `coingecko.api_key`; the connector sends it as the `x-cg-demo-api-key` header
3. Set `coingecko.enabled` to `true`

The connector issues one `/coins/list` call at startup and one `/simple/price` call per cycle, roughly 4,300 calls per month at the default 10 minute interval.

#### Deprecated sources

CryptoCompare (now CoinDesk Data) retired its free API tier on 21 May 2026. `cryptocompare.enabled` is `false` by default and `CryptoCompare` has been removed from the default `priorities`. The connector is not removed: operators holding a CoinDesk Data subscription can set `cryptocompare.enabled` to `true`, provide `cryptocompare.api_key`, and add `CryptoCompare` back to `priorities`. Full removal is planned for the next major release.

Running `pnpm run migrate` on a v1 configuration never produces an enabled source that cannot work:

- CryptoCompare stays enabled only when the legacy `ccApiKey` is present, and the migration reminds you to add `CryptoCompare` back to `priorities` in that case
- CoinMarketCap stays enabled only when the legacy `cmcApiKey` is present
- CoinGecko is always disabled, because v1 configurations carry no Demo key

Every case prints a warning naming the follow-up step.

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
