# Architecture

Currencyinfo is a single [NestJS](https://nestjs.com) process backed by MongoDB. There is no message broker, no cache tier, and no worker fleet: one scheduled loop refreshes an in-memory rate table, and the HTTP layer reads from that table.

## Components

```
                      ┌──────────────────────────────────────────┐
   rate providers     │            Currencyinfo process          │
   ───────────────    │                                          │
   CoinPaprika ──┐    │  SourcesManager                          │
   CoinLore    ──┤    │    ├── connector per provider            │
   Binance     ──┼───▶│    ├── coin/ID discovery at startup      │
   CoinGecko   ──┤    │    └── per-pair coverage map             │
   CoinMarketCap─┤    │              │                           │
   CryptoCompare─┤    │              ▼                           │
   ExchangeRate- ┤    │  RatesService (interval scheduler)       │
   API / .host ──┤    │    ├── fetch + validate per source       │
   Currency API──┤    │    ├── RatesMerger: group, weigh, merge  │──▶ MongoDB
   MOEX        ──┘    │    ├── triangulate base coins           │    tickers
                      │    └── in-memory ticker table            │    timestamps
                      │              │                           │
                      │              ▼                           │
   clients ◀──────────│  RatesController  /get /getHistory /status│
                      │              │                           │
                      │              ▼                           │
   Slack / Discord ◀──│  Notifier (operational alerts)           │
   ADAMANT Messenger  └──────────────────────────────────────────┘
```

| Module | Path | Responsibility |
| --- | --- | --- |
| Bootstrap | `src/main.ts` | Starts the HTTP server, wires the logger, sends the startup notification |
| Configuration | `src/global/config/` | Loads JSONC, validates it against a strict Zod schema, exits on any error |
| Logger | `src/global/logger/` | Level-filtered console and file logging with secret redaction |
| Notifier | `src/global/notifier/` | Fans one alert out to Slack, Discord, and ADAMANT Messenger |
| Sources manager | `src/rates/sources/sources-manager.ts` | Instantiates connectors, runs coin discovery, builds the per-pair coverage map |
| Connectors | `src/rates/sources/api/` | One class per provider, each returning a `BASE/QUOTE` to price map |
| Merger | `src/rates/merger/` | Grouping, divergence detection, strategy resolution, triangulation |
| Rates service | `src/rates/rates.service.ts` | Refresh scheduler, in-memory table, MongoDB persistence, query handling |
| Controller | `src/rates/rates.controller.ts` | `/get`, `/getHistory`, `/status` |

## Startup sequence

1. `configuration.ts` resolves the config file, parses it as JSONC, and validates it against the Zod schema. Any error prints a formatted report and exits with a non-zero status before a port is opened
2. Mongoose connects to MongoDB. `autoIndex` creates any missing index on the `tickers` and `timestamps` collections
3. `SourcesManager` instantiates every connector. Each one decides on its own whether it is enabled, from its `enabled` flag, the presence of a required key, and a non-empty coin list
4. Connectors that address coins by provider ID run discovery once: CoinGecko and CoinPaprika download their coin directories, CoinLore downloads its asset directory only if a configured symbol is unresolved, and Binance validates its markets with one `exchangeInfo` call. Discovery retries up to three times with a backoff before the source is reported unavailable
5. `SourcesManager` builds the coverage map: for every pair, how many enabled sources advertise it, capped at `minSources`. Pairs below the configured value are listed in a startup warning
6. The HTTP server binds to `server.port`, and the first refresh cycle starts immediately

## Refresh cycle

The cycle runs every `refreshInterval` minutes, defaulting to 10. Overlapping runs are impossible: a cycle that starts while the previous one is still running logs a warning and returns.

1. Every enabled source is fetched in sequence. A connector failure is caught, logged with the URL and parameters redacted, and the source is recorded as unavailable for this cycle
2. Each response is validated: malformed pair names and non-positive or non-finite prices are dropped, and a source that returns no usable rate at all counts as unavailable
3. Surviving quotes are timestamped and merged into the multi-source table, one entry per source per pair
4. Quotes older than `rateLifetime` are excluded, the remainder are grouped and resolved into a single rate per pair — see [rate calculation](./rate-calculation.md)
5. Pairs covered by fewer fresh sources than their coverage map entry are dropped and reported
6. Cross-rates for every configured base coin are triangulated from the USD rates
7. If at least one source succeeded and at least one pair survived, the full table is written to MongoDB as one snapshot and `last_updated` advances

If every source fails, nothing is written. The previous snapshot stays in history, `/get` keeps serving the cached table until the quotes age past `rateLifetime`, and an error notification is dispatched.

## Data flow guarantees

- **Pair direction**: a pair is always `BASE/QUOTE`, and the value is how many quote units equal one base unit. `BTC/USD` is the dollar price of one bitcoin
- **USD is the pivot**: every connector emits `<COIN>/USD`, and all other base coins are derived from those quotes by triangulation
- **Freshness**: a quote participates in merging only while it is younger than `rateLifetime`. Stale quotes are never served and never enter a snapshot
- **Isolation**: no provider failure can take down another provider, the HTTP layer, or the process
- **Determinism**: given the same quotes, timestamps, and configuration, the merged output is identical

## Storage model

Two collections, both written non-transactionally in that order:

| Collection | Document | Purpose |
| --- | --- | --- |
| `tickers` | `{ base, quote, rate, date }` | One document per pair per snapshot |
| `timestamps` | `{ date }` | One document per snapshot, unique on `date` |

`timestamps` is the registry of complete snapshots. A `tickers` group whose `date` has no `timestamps` entry is an interrupted write and is skipped by every history query rather than returned as a partial snapshot. See [rate history](./history.md) for the indexes and the query semantics.

## Runtime footprint

- Node.js 22 or newer, compiled with SWC
- MongoDB 6.0 or newer
- One outbound HTTPS connection per source per cycle, plus the one-off discovery downloads at startup
- No inbound dependencies other than the configured HTTP port
