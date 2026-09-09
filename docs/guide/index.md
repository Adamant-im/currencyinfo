# What is Currencyinfo

Currencyinfo is a self-hosted exchange rates service. It fetches quotes for the coins and currencies you configure from several independent providers, cross-checks those quotes against each other, resolves the disagreements deterministically, stores a historical snapshot on every cycle, and serves the result over a small REST API.

It is a complete product rather than a library: you deploy a container, mount one configuration file, and point your application at `http://your-host:36661/get`.

## The problem it solves

Applications that display prices usually start by calling one public rate API directly. That works until it does not:

- the provider retires its free tier, and every client breaks at once, which is exactly what happened to CryptoCompare on 21 May 2026
- a single bad quote propagates straight into user-facing balances, because there is nothing to compare it against
- rate-limit budgets are consumed per application instance rather than per operator
- every price lookup tells a third party which coins your users hold and how often they look

Currencyinfo puts one auditable service between your applications and the outside world. Providers are pluggable, quotes are validated against each other before they are served, the rate-limit budget is spent once per deployment, and the only party that sees your query pattern is you.

## What it does

- **Fetches** rates on a fixed interval from every enabled source, with per-source error isolation so one failure cannot affect another
- **Normalizes** every quote into `BASE/QUOTE` pairs against USD, then triangulates the other base coins deterministically
- **Groups** the quotes for each pair by relative distance and picks the dominant group by weight
- **Resolves** the surviving group into a single rate using the configured strategy (`avg`, `min`, `max`, `priority`, `weight`)
- **Alerts** through Slack, Discord, and ADAMANT Messenger when sources diverge, when a provider goes down, or when a pair loses coverage
- **Stores** a full snapshot per cycle in MongoDB and serves it back through `/getHistory`
- **Serves** current rates, historical rates, and a readiness endpoint over plain HTTP

## What it does not do

- It is not a trading API. There are no order books, no candles, and no volume data
- It does not proxy provider responses. A rate is served only after it survives validation, grouping, and merging
- It does not phone home. There is no telemetry, no analytics, and no update check
- It does not manage credentials for you. Provider keys live in your configuration file and never leave the process

## Use cases

| Use case | What Currencyinfo provides |
| --- | --- |
| Wallets and messengers | One endpoint for every fiat equivalent shown in the UI, with a coin list you control |
| Payment processing and invoicing | Rates that survive a single provider outage, plus a stored snapshot for the exact moment of an invoice |
| Trading and portfolio tools | Cross-checked quotes with explicit divergence handling instead of a single opaque feed |
| Accounting and reporting | `/getHistory` point-in-time and interval queries against your own database |
| Internal dashboards and research | A stable local API with no per-seat rate limits and no third-party visibility into your queries |
| Air-gapped or restricted networks | A single outbound egress point that you can allowlist, proxy, and audit |

## Project values

These constraints shape every design decision in the repository, and they are the reason to prefer a self-hosted rates service over a hosted one:

- **Reliability**: a failing provider degrades coverage instead of taking the service down, and stale quotes are dropped rather than served
- **Calculation accuracy**: pair direction, inverse triangulation, and rounding are explicit and tested
- **Privacy and zero telemetry**: no analytics, no tracking, no outbound traffic beyond the providers you enable
- **Decentralization**: no single provider is load-bearing, and the default set contains no mandatory commercial dependency
- **Low self-hosting requirements**: a Node.js process and a MongoDB instance, small enough to share a VPS with the application it serves

## ADAMANT as a production adopter

[ADAMANT](https://adamant.im) is a decentralized, anonymous, community-driven communication and transaction network. ADAMANT Messenger clients call a Currencyinfo deployment for the fiat equivalents they display, which is where the service is proven in production and where its reliability requirements come from.

The ADAMANT developer community maintains this repository, reviews contributions, and publishes releases. That is the extent of the coupling:

- the service has no ADAMANT dependency at runtime, apart from the optional ADAMANT Messenger notification channel
- `ADM` is one symbol among the defaults in the per-source coin lists, and removing it requires no other change
- the REST API, the configuration schema, and the storage format contain nothing ADAMANT-specific

## Project links

| Resource | Location |
| --- | --- |
| Landing page | [currencyinfo.dev](https://currencyinfo.dev) |
| Documentation | [currencyinfo.docs.adamant.im](https://currencyinfo.docs.adamant.im) |
| Source code | [github.com/Adamant-im/currencyinfo](https://github.com/Adamant-im/currencyinfo) |
| Releases | [github.com/Adamant-im/currencyinfo/releases](https://github.com/Adamant-im/currencyinfo/releases) |
| Container image | [ghcr.io/adamant-im/currencyinfo](https://github.com/Adamant-im/currencyinfo/pkgs/container/currencyinfo) |
| Issue tracker | [github.com/Adamant-im/currencyinfo/issues](https://github.com/Adamant-im/currencyinfo/issues) |
| License | [GPL-3.0](https://github.com/Adamant-im/currencyinfo/blob/master/LICENSE) |

## Next steps

- [Quick start with Docker](./quick-start.md) to get an instance running
- [Architecture](./architecture.md) for the request and refresh flow
- [Rate calculation](./rate-calculation.md) for how disagreeing quotes become one rate
