# ![Currencyinfo logo](./.github/logo.png) Currencyinfo

**A universal, self-hosted crypto and fiat exchange rates service.** Aggregate rates from many providers, validate them against each other, and serve them from your own infrastructure through one REST API.

[Landing page](https://currencyinfo.dev) · [Documentation](https://currencyinfo.docs.adamant.im) · [Releases](https://github.com/Adamant-im/currencyinfo/releases) · [Container image](https://github.com/Adamant-im/currencyinfo/pkgs/container/currencyinfo) · [Issues](https://github.com/Adamant-im/currencyinfo/issues)

```http
GET http://localhost:36661/get?coin=BTC,ETH
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

## Why run your own

Applications that display prices usually call one public rate API directly. That works until the provider retires its free tier, until a single bad quote reaches user-facing balances with nothing to compare it against, or until you notice that every price lookup tells a third party which coins your users hold.

Currencyinfo puts one auditable service between your applications and the outside world. Wallets, payment processors, trading tools, accounting systems, dashboards, and research pipelines all use it the same way: deploy a container, mount one configuration file, point your app at `/get`.

## Features

- 🏠 **Self-hosted & decentralized**: run your own rates provider with no dependence on a single centralized service
- 🌐 **Multi-source aggregation**: ten connectors covering crypto exchanges, aggregators, and fiat providers, with five keyless sources enabled by default
- 🔒 **Divergence & outage resilience**: groups source rates by percentage threshold, drops inconsistent outliers, and raises configurable alerts
- ⚙️ **Configurable strategies**: choose the resolution method (`avg`, `min`, `max`, `priority`, `weight`) that fits your deployment
- 📬 **Multi-channel notifications**: real-time operational alerts via Slack, Discord, and [ADAMANT Messenger](https://adamant.im)
- 📊 **Historical rate storage**: persists snapshots in MongoDB for instant interval and point-in-time queries
- 🚀 **Lightweight & fast**: NestJS, TypeScript, and SWC, small enough to share a VPS with the application it serves
- 🛡️ **Zero telemetry**: no analytics, no tracking, no update check. It talks to the providers you enable and to your own database

## Who maintains it

Currencyinfo is an independent open-source product, maintained by the ADAMANT developer community and licensed under [GPL-3.0](LICENSE).

[ADAMANT](https://adamant.im) is a production adopter: its Messenger clients query a Currencyinfo deployment for every fiat amount they display, which is where the service is proven at scale. Nothing in it is ADAMANT-specific — `ADM` is one symbol among the default coin lists, and removing it changes nothing else.

> Brought to you by the ADAMANT developer community and cryptofoundry.
> Custom crypto software, trading bots, payment systems and blockchain infrastructure — built for production. [Tell us what to build](https://adamant.business#contact).

## Data Sources

![Data sources: CoinPaprika, CoinLore, Binance, Currency API, ExchangeRate-API, CoinGecko, CoinMarketCap, ExchangeRate.host, MOEX, CryptoCompare (light theme)](./.github/banner-light.png#gh-light-mode-only)
![Data sources: CoinPaprika, CoinLore, Binance, Currency API, ExchangeRate-API, CoinGecko, CoinMarketCap, ExchangeRate.host, MOEX, CryptoCompare (dark theme)](./.github/banner-dark.png#gh-dark-mode-only)

Enabled by default, keyless, no signup:

- 🌶️ [CoinPaprika](https://coinpaprika.com) — broad cryptocurrency rates, 20,000 calls per month
- 🪙 [CoinLore](https://coinlore.com) — broad cryptocurrency rates, the whole coin set in one request per cycle
- 🟡 [Binance](https://binance.com) — public spot market data from an exchange rather than an aggregator
- 💵 [Currency API](https://github.com/fawazahmed0/exchange-api) — free, open-source fiat exchange rates
- 💶 [ExchangeRate-API](https://www.exchangerate-api.com) — keyless fiat endpoint covering 166 currencies

Disabled by default because they need a key:

- 🦎 [CoinGecko](https://coingecko.com) — broad cryptocurrency rates, free Demo plan key
- 📈 [CoinMarketCap](https://coinmarketcap.com) — fast-updating quotes, paid API tiers
- 🏦 [ExchangeRate.host](https://exchangerate.host) — currencies, forex, and precious metals
- 🏛️ [MOEX](https://moex.com) — Moscow Exchange data, keyless but RUB-denominated

Deprecated:

- 💱 [CryptoCompare](https://developers.coindesk.com), now CoinDesk Data — the free tier was retired on 21 May 2026, so the connector is kept for subscribers only

Three keyless crypto sources and two keyless fiat sources means `minSources: 2` is satisfiable out of the box, with no API key.

> [!IMPORTANT]
> Keyless access is not the same as permission to republish. CoinPaprika and ExchangeRate-API both restrict redistribution by a public or commercial instance. Read [source terms and redistribution](https://currencyinfo.docs.adamant.im/reference/sources/#terms-and-redistribution) before serving these rates onwards.

Per-source quotas, identifiers, failure modes, and terms are documented in the [source reference](https://currencyinfo.docs.adamant.im/reference/sources/).

## Quick Start

The published image runs as a non-root user, contains no configuration, and covers `linux/amd64` and `linux/arm64`.

```bash
# 1. Configuration template
curl -fsSL -o config.jsonc \
  https://raw.githubusercontent.com/Adamant-im/currencyinfo/master/config.default.jsonc

# 2. The container runs as UID/GID 1000 and cannot chown a bind mount
sudo chown 1000:1000 config.jsonc && sudo chmod 600 config.jsonc

# 3. Compose file with the app and a pinned MongoDB
curl -fsSL -o docker-compose.yaml \
  https://raw.githubusercontent.com/Adamant-im/currencyinfo/master/docker-compose.prod.yaml

docker compose up -d
```

```bash
curl -s http://localhost:36661/status          # ready?
curl -s "http://localhost:36661/get?coin=BTC"  # rates
```

Pin a version rather than `latest` for anything you depend on:

```bash
docker pull ghcr.io/adamant-im/currencyinfo:4.2.0
```

Full walkthrough: [Quick start with Docker](https://currencyinfo.docs.adamant.im/guide/quick-start).

### From source

```bash
git clone https://github.com/Adamant-im/currencyinfo.git
cd currencyinfo
pnpm install --ignore-scripts
pnpm run deps:setup
cp config.default.jsonc config.jsonc
pnpm run build
pnpm run start:prod
```

Requires Node.js 22.12+, pnpm, and MongoDB 6.0+. Full instructions, including a systemd unit: [Installation](https://currencyinfo.docs.adamant.im/guide/installation).

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /get` | Current merged rates, optionally filtered by `coin` and `rateLifetime` |
| `GET /getHistory` | Stored snapshots by interval, point in time, or pair |
| `GET /status` | Readiness, refresh schedule, and version |

Pairs are always `BASE/QUOTE`, and the value is how many quote units equal one base unit. Parameters, response schemas, validation errors, units, and freshness semantics: [REST API reference](https://currencyinfo.docs.adamant.im/reference/api).

## Configuration

One JSONC file, validated strictly at startup: unknown keys are rejected, credential placeholders are recognised as "no credential", and a source that cannot work fails before the port opens rather than on every request.

```jsonc
{
  "strategy": "priority",
  "minSources": 2,
  "rateLifetime": 60,
  "base_coins": ["USD", "RUB", "EUR", "CNY", "JPY", "BTC", "ETH"],
  "server": { "port": 36661, "mongodb": { "host": "mongodb", "port": 27017, "db": "tickersdb" } }
}
```

Every option: [configuration reference](https://currencyinfo.docs.adamant.im/reference/configuration). How disagreeing quotes become one rate: [rate calculation](https://currencyinfo.docs.adamant.im/guide/rate-calculation).

## Documentation

| Topic | Link |
| --- | --- |
| Overview, positioning, use cases | [What is Currencyinfo](https://currencyinfo.docs.adamant.im/guide/) |
| Architecture and refresh cycle | [Architecture](https://currencyinfo.docs.adamant.im/guide/architecture) |
| Docker quick start | [Quick start](https://currencyinfo.docs.adamant.im/guide/quick-start) |
| Installation and upgrades | [Installation](https://currencyinfo.docs.adamant.im/guide/installation), [Upgrade and rollback](https://currencyinfo.docs.adamant.im/guide/upgrading) |
| Rate calculation and merging | [Rate calculation](https://currencyinfo.docs.adamant.im/guide/rate-calculation) |
| History, indexes, retention | [Rate history](https://currencyinfo.docs.adamant.im/guide/history) |
| Alerts | [Notifications](https://currencyinfo.docs.adamant.im/guide/notifications) |
| Production operations | [Operations](https://currencyinfo.docs.adamant.im/guide/operations), [Security](https://currencyinfo.docs.adamant.im/guide/security), [Troubleshooting](https://currencyinfo.docs.adamant.im/guide/troubleshooting) |
| Reference | [REST API](https://currencyinfo.docs.adamant.im/reference/api), [Configuration](https://currencyinfo.docs.adamant.im/reference/configuration), [Sources](https://currencyinfo.docs.adamant.im/reference/sources/) |

## Development and Testing

```bash
pnpm test               # unit tests
pnpm run test:cov       # tests with coverage
pnpm run lint           # eslint
pnpm run format:check   # prettier
pnpm run build          # compile

pnpm run docs:dev       # documentation site, hot reload
pnpm run docs:build     # documentation build, fails on dead internal links
pnpm run docs:links     # repository-wide Markdown link and anchor check
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines, coding standards, and verification workflows. Report security issues privately to `devs@adamant.im` rather than in a public issue.

## License

Licensed under the [GNU General Public License v3.0](LICENSE).
