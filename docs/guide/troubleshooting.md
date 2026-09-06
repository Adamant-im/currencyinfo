# Troubleshooting

Symptoms first, then causes. Start by reading the logs — every case below is visible there.

```bash
# Container
docker compose logs -f app

# Source installation
tail -f logs/*.log
```

Raise the verbosity while diagnosing, which adds one line per source per cycle:

```jsonc
{
  "log_level": "info"
}
```

## The service will not start

### `No configuration file found. Cannot start the app.`

The process looks for `config.jsonc` in its **working directory**. In the container that is `/usr/src/currencyinfo`, which is where the bind mount must land:

```bash
-v "$(pwd)/config.jsonc:/usr/src/currencyinfo/config.jsonc:ro"
```

`config.default.jsonc` is a template, not a fallback: it is only used automatically in development mode and under Jest. A production start with no `config.jsonc` is an error by design.

### `EACCES` on the configuration file

The container runs as UID and GID `1000`, and Docker cannot change the ownership of a bind mount. A file readable only by your own user is unreadable inside the container:

```bash
sudo chown 1000:1000 config.jsonc
chmod 600 config.jsonc
```

### `App configuration is invalid:`

The report names the offending path. Common causes:

| Message fragment | Cause |
| --- | --- |
| `Unrecognized key` | A typo, or an option removed in a newer release. The schema is strict on purpose |
| `Provide an API key when … is enabled` | The source is enabled with no key, or with the shipped placeholder still in place |
| `Provide at least one coin or ID when … is enabled` | The source is enabled with an empty coin list |
| `Invalid Slack webhook url` / `Invalid Discord webhook url` | The URL does not match the documented provider format |
| `Provide passphrase to use ADAMANT notifier` | `notify.adamant` lists addresses but `adamantPassphrase` is absent or still the placeholder |
| `'quote_asset' must be a USD-pegged asset` | `binance.quote_asset` is set to something that does not track the dollar |
| `it is the configured quote asset and has no market against itself` | `binance.coins` contains `binance.quote_asset` |

The full option list is in the [configuration reference](../reference/configuration.md).

### The process exits immediately with a MongoDB error

Connection is attempted once, with a 2 second server-selection timeout and no retry, so a wrong host fails fast rather than hanging.

- **Container**: `server.mongodb.host` must be reachable from inside the container. With the shipped Compose file that is the service name `mongodb`, not `127.0.0.1`
- **Source installation**: `127.0.0.1` is usually right
- Check the database is actually up: `docker compose ps`, or `mongosh --eval 'db.runCommand({ping:1})'`

## `/status` reports `ready: false`

`ready` turns `true` after the first snapshot is stored. If it stays `false`:

1. **Discovery is still running.** CoinPaprika and CoinGecko download a coin directory at startup, and discovery retries up to three times with a backoff. Give a cold start a minute
2. **Every source failed.** The log says `Unable to get new rates from all sources (…)`. Check outbound HTTPS, and check whether an enabled source needs a key it does not have
3. **Everything was rejected by merging.** The log says `No valid rates remain after validation and merging`. Usually `minSources` above real coverage, or `groupPercentage` too strict for the source mix
4. **The database write failed.** The log says `Unable to save new rates in history database`. Check disk space and MongoDB health

## `/get` returns an empty result

```json
{ "success": true, "date": 1720472096540, "result": {}, "last_updated": null, "version": "4.2.0" }
```

- `last_updated: null` means no snapshot has ever been stored. See the previous section
- with a `coin` filter, the symbol may simply not be covered. Call `/get` without a filter and check what is actually there
- symbols are uppercased, but they must otherwise match exactly. `coin=btc` works, `coin=Bitcoin` does not
- a `rateLifetime` override shorter than the age of the quotes filters everything out. Try without it

## A specific pair is missing

Work down this list:

1. **Is the coin in a source's coin list?** Only configured coins are requested. Add it to `coinpaprika.ids`, `coinlore.ids`, `binance.coins`, and so on
2. **Is the base coin in `base_coins`?** Cross-rates only exist for configured base coins
3. **Does any source quote the base coin?** Startup warns: `No resources provide rates for the following base coins: …`. Without a `BASE/USD` quote, no cross-rate for that base can be triangulated
4. **Did the coverage gate drop it?** The cycle reports `expected 2, but got 1`. Either lower `minSources` or add a source that quotes the pair
5. **Was it rejected as ambiguous?** The alert reads `The difference between sources is too big: … against …` and names the sources. One of them is wrong, or your thresholds are stricter than the mix supports
6. **Was it excluded at startup?** CoinPaprika excludes low-ranked coins beyond `max_individual_requests` and warns with their names

## Repeated `Unable to fetch valid data from …`

That source fails every cycle. By provider:

| Source | Likely cause |
| --- | --- |
| CryptoCompare | The free tier was retired on 21 May 2026. It answers `401` without a subscription. [Details](../reference/sources/cryptocompare.md) |
| CoinGecko | The keyless plan rate-limits aggressively. Add a free Demo key. [Details](../reference/sources/coingecko.md) |
| Binance | HTTP `451` in a geo-blocked region. The connector disables itself for the run and alerts once. [Details](../reference/sources/binance.md) |
| CoinPaprika | Monthly quota exhausted by a short `refreshInterval`. [Details](../reference/sources/coinpaprika.md) |
| CoinMarketCap, ExchangeRate.host | Invalid or expired key, or a plan that does not include the endpoint |
| MOEX | The default URL is a proxy that may be unreachable, and USD and EUR trading has been prohibited there since June 2024. [Details](../reference/sources/moex.md) |

If a provider is permanently unavailable to you, disable it. A source that fails every cycle produces a notification every `refreshInterval` and inflates the enabled-source count that `minSources` is measured against.

## Notifications are not arriving

- the whole `notify` object may be missing. Alerts still go to the log
- Slack and Discord URLs are validated at startup, so a malformed one would have failed the start. A valid but revoked webhook fails at send time and is logged as `Failed to dispatch notification`
- ADAMANT delivery needs the sending account to hold ADM for fees, and the passphrase must not be the shipped placeholder
- `log_level: "none"` silences the log copy but not the channels

## Rates look wrong

1. **Check the direction.** `BTC/USD` is dollars per bitcoin. The inverse pair is a different key
2. **Check which source won.** Set `log_level: "info"` and watch a cycle; the divergence alert names every group and its sources
3. **Check for a stablecoin depeg.** Binance rates are quoted against `binance.quote_asset` and served as USD, so a depeg shifts every Binance rate by the depeg magnitude. `USDT/USD` and `USDC/USD` are in the aggregator defaults so the peg stays visible
4. **Check `decimals`.** Very small rates can round to zero and are then dropped rather than served

## History queries return nothing

- `/getHistory` requires at least one parameter. A bare call is a `400`
- `from` and `to` are **seconds**, not milliseconds. A millisecond value lands far in the future
- `from` greater than `to` is a `400`
- with `timestamp` plus `coin`, the closest snapshot *containing that pair* is returned. If nothing comes back, the pair has never been stored
- a snapshot whose registry entry is missing — an interrupted write — is skipped rather than returned

## Getting help

Open an issue at [Adamant-im/currencyinfo/issues](https://github.com/Adamant-im/currencyinfo/issues) with:

- the version from `/status`
- how it is deployed, container or source
- the relevant log lines, with credentials removed
- your configuration **with every key, webhook, and passphrase redacted**

Report a suspected vulnerability privately instead — see [security](./security.md#reporting-a-vulnerability).
