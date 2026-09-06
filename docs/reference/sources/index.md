# Rate sources

Currencyinfo ships ten connectors. Five are keyless and enabled by default, so a fresh install returns rates without an API key. Four need a key and are shipped disabled. One is deprecated.

Each connector decides on its own whether it is active: it needs `enabled` not to be `false`, a non-empty coin or code list, and a real API key where one is required.

## The default source set

| Source | Type | Covers | Key | Default |
| --- | --- | --- | --- | --- |
| [CoinPaprika](./coinpaprika.md) | Aggregator | Crypto | None | **Enabled** |
| [CoinLore](./coinlore.md) | Aggregator | Crypto | None | **Enabled** |
| [Binance](./binance.md) | Exchange | Crypto spot | None | **Enabled** |
| [Currency API](./currency-api.md) | Open data | Fiat | None | **Enabled** |
| [ExchangeRate-API](./exchangerate-api.md) | Commercial | Fiat | None | **Enabled** |
| [CoinGecko](./coingecko.md) | Aggregator | Crypto | Free Demo key | Disabled |
| [CoinMarketCap](./coinmarketcap.md) | Aggregator | Crypto | Paid | Disabled |
| [ExchangeRate.host](./exchangerate-host.md) | Commercial | Fiat, metals, BTC | Paid | Disabled |
| [MOEX](./moex.md) | Exchange | Fiat vs RUB | None | Disabled |
| [CryptoCompare](./cryptocompare.md) | Aggregator | Crypto, fiat | Subscription | **Deprecated** |

Three keyless crypto sources and two keyless fiat sources means `minSources: 2` is satisfiable out of the box.

::: info Why this set
CryptoCompare retired its free tier on 21 May 2026, which broke the previous default configuration for every operator running it: the source failed on every cycle and free crypto coverage collapsed to CoinGecko alone. The current defaults restore multi-source coverage with no mandatory credential, and deliberately mix an exchange in with the aggregators, because aggregators partly share upstream data.
:::

## Connector names

These names are what `priorities` matches and what appears in log lines and alerts. They are case-sensitive.

| Connector name | Config key |
| --- | --- |
| `CoinPaprika` | `coinpaprika` |
| `CoinLore` | `coinlore` |
| `Binance` | `binance` |
| `CurrencyApi` | `currency_api` |
| `ExchangeRateApi` | `exchange_rate_api` |
| `Coingecko` | `coingecko` |
| `Coinmarketcap` | `coinmarketcap` |
| `ExchangeRateHost` | `exchange_rate_host` |
| `MOEX` | `moex` |
| `CryptoCompare` | `cryptocompare` |

`ExchangeRateApi` and `ExchangeRateHost` are two unrelated providers with confusingly similar names. `ExchangeRateApi` is the keyless `open.er-api.com` endpoint; `ExchangeRateHost` is the key-requiring `exchangerate.host` service.

## Requests per cycle

With the shipped configuration, at the default `refreshInterval` of 10 minutes:

| Source | Startup | Per cycle | Monthly, 31 days |
| --- | --- | --- | --- |
| CoinPaprika | 1 directory download | 1 bulk + 1 per out-of-range coin, 2 with the defaults | ~8,900 |
| CoinLore | 1 directory download, only if symbols need resolving | 1 | ~4,500 |
| Binance | 1 `exchangeInfo` | 1 | ~4,500 |
| Currency API | — | 1 | ~4,500 |
| ExchangeRate-API | — | 1 | ~4,500 |
| CoinGecko | 1 directory download | 1 | ~4,500 |
| CoinMarketCap | 1, only when symbols are configured | 1 | ~4,500 |
| ExchangeRate.host | — | 1 | ~4,500 |
| MOEX | — | 1 | ~4,500 |
| CryptoCompare | — | 1 | ~4,500 |

Coin discovery runs once per start, not per cycle. Shortening `refreshInterval` multiplies every per-cycle number, and CoinPaprika's free quota is the binding constraint — see [CoinPaprika](./coinpaprika.md#quota).

## Terms and redistribution

Keyless access is not the same as permission to republish the data. Both keyless sources that carry restrictions do so based on how the instance is used, not on whether a key is paid for.

| Source | Private or development instance, rates consumed by you | Public or commercial instance serving these rates onwards |
| --- | --- | --- |
| [CoinPaprika](https://docs.coinpaprika.com/api-plans) | Permitted on the free plan, which is marked "Personal" usage | Redistribution is offered on the Enterprise plan only. The paid Starter through Ultimate plans allow commercial usage without granting redistribution |
| [ExchangeRate-API](https://www.exchangerate-api.com/docs/free) | Permitted, and attribution is required | Not permitted. Contact the provider for written permission |

If you operate a public or commercial instance, either obtain the relevant permission or set `"enabled": false` on those sources and replace their coverage. The remaining keyless sources — CoinLore, Binance, Currency API — plus the key-requiring ones have no comparable restriction, but check their terms yourself before relying on this summary.

The other sources' terms are their own; this table covers only the two whose defaults could surprise an operator.

## Choosing a mix

A few rules that matter more than the individual providers:

- **Two sources minimum for anything that matters.** A single source cannot be cross-checked, and `minSources` silently degrades to 1 for pairs only one provider quotes
- **Prefer independence over count.** CoinGecko, CoinMarketCap, CoinPaprika, and CoinLore partly share upstream data, so four aggregators agreeing is weaker evidence than two aggregators plus an exchange. Binance is in the defaults for exactly this reason
- **Fiat and crypto are separate problems.** The crypto sources do not quote fiat cross-rates usefully, and the fiat sources do not quote crypto. Keep at least one of each
- **Match the refresh interval to the slowest source.** Currency API and ExchangeRate-API update once a day. Refreshing every minute does not make their numbers newer, it only burns quota
- **Watch the quotas.** A short `refreshInterval` multiplies every provider's monthly call count

## Adding coins

Coins are configured per source. Adding a coin to only one source leaves it below `minSources`, which the startup warning reports:

```
The following pairs have fewer enabled sources than the configured minimum
(minSources=2), but they are going to be saved anyway: XYZ/USD (1)
```

The identifier form differs by provider, and the ID form is preferred wherever both exist, because ticker symbols are ambiguous:

| Source | Symbols | IDs |
| --- | --- | --- |
| CoinPaprika | `coins` | `ids`, strings like `btc-bitcoin` |
| CoinLore | `coins` | `ids`, symbol to numeric ID |
| CoinGecko | `coins` | `ids`, strings like `bitcoin` |
| CoinMarketCap | `coins` | `ids`, symbol to numeric UCID |
| Binance | `coins` | — |
| Currency API, ExchangeRate-API, ExchangeRate.host | `codes` | — |
| CryptoCompare | `coins` | — |
| MOEX | — | `codes`, pair to market code |

## What the defaults cover

The default coin lists cover every asset in [`adamant-wallets`](https://github.com/Adamant-im/adamant-wallets/tree/master/assets/general) that ADAMANT clients quote as a currency of its own — `ADM`, `BTC`, `ETH`, `BNB`, `DOGE`, `DASH`, `USDT`, `USDC` — plus `XRP`, `SOL`, `ADA`, `TRX`, and `LTC`, which every crypto source quotes and which therefore give the divergence check enough overlap to be meaningful.

ERC-20 tokens listed in `adamant-wallets` are not enabled by default. Add them to the per-source coin lists when you need them.

`USDT/USD` and `USDC/USD` are deliberately kept in the aggregator defaults, so a stablecoin depeg stays visible in the served data rather than being hidden by a symbol alias.
