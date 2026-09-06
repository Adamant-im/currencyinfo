# CoinPaprika

Keyless crypto aggregator, **enabled by default**. Free tier: 20,000 calls per month at 10 requests per second, no signup.

| Property | Value |
| --- | --- |
| Connector name | `CoinPaprika` |
| Config key | `coinpaprika` |
| Website | [coinpaprika.com](https://coinpaprika.com) |
| Endpoints | `api.coinpaprika.com/v1/coins`, `api.coinpaprika.com/v1/tickers` |
| Credential | None |
| Covers | Cryptocurrencies, quoted against USD |
| Default weight | `10` |

## Configuration

```jsonc
{
  "coinpaprika": {
    "enabled": true,
    "coins": ["BTC", "ETH", "ADM"],
    "ids": [
      "btc-bitcoin",
      "eth-ethereum",
      "bnb-binance-coin",
      "xrp-xrp",
      "sol-solana",
      "doge-dogecoin",
      "ada-cardano",
      "trx-tron",
      "ltc-litecoin",
      "dash-dash",
      "usdt-tether",
      "usdc-usd-coin",
      "adm-adamant-messenger"
    ],
    "bulk_limit": 200,
    "max_individual_requests": 5
  }
}
```

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | |
| `weight` | number ≥ 0 | `10` | Voting power in group selection |
| `coins` | string array | — | Ticker symbols. Ambiguous, prefer `ids` |
| `ids` | string array | — | CoinPaprika coin IDs |
| `bulk_limit` | integer 1–2000 | `200` | Rows requested in the single ranked bulk call |
| `max_individual_requests` | integer 0–100 | `5` | Cap on per-coin calls for coins outside the bulk range |

At least one of `coins` or `ids` is required when enabled.

Find an ID on the coin's page, for example `adm-adamant-messenger` at [coinpaprika.com/coin/adm-adamant-messenger](https://coinpaprika.com/coin/adm-adamant-messenger/).

## Prefer `ids` over `coins`

CoinPaprika ticker symbols are **not unique**. `ADM` matches both `adm-adamant-messenger` (rank 1510, a coin) and `adm-voice-of-the-gods-by-virtuals` (rank 5688, a token), so a first-match lookup would silently substitute one asset for another.

The connector resolves a symbol among *active* candidates by best rank, and verifies the symbol on every returned ticker before emitting its price. That makes symbol configuration safe, but an explicit ID removes the ambiguity entirely.

## There is no batch-by-IDs endpoint

This shapes the whole connector, and it is why CoinPaprika costs more than one call per cycle. Verified against the live API:

- `/v1/tickers?ids=…`, `?coin_ids=…`, and `?id=…` are **silently ignored**. All three return the identical full payload instead of a filtered subset, so an unsupported parameter fails open rather than erroring
- `/v1/tickers/btc-bitcoin,eth-ethereum` answers `404 page not found`, so there is no multi-ID path form
- `/v1/tickers?limit=N` returns strictly the top N by rank, capped at 2000 rows regardless of a higher value
- per-coin quotes are available only one call at a time, at `/v1/tickers/{coin_id}`

Coverage is therefore assembled from one ranked bulk call plus one single-coin call for every configured coin that ranks outside the bulk window.

## Quota

A cycle costs:

```
1 bulk call + 1 call per admitted coin ranking outside bulk_limit
```

With the shipped defaults every configured ID except `ADM` ranks inside the top 100, so a cycle costs **two calls**: the bulk call plus one for ADM.

| `refreshInterval` | Calls per 31-day month | Within the 20,000 free quota |
| --- | --- | --- |
| 10 minutes | ~8,900 | Yes |
| 5 minutes | ~17,900 | Yes, with little headroom |
| 4.5 minutes | ~19,800 | Borderline |
| 1 minute | ~89,000 | No |

Keep `refreshInterval` at 5 or more with two calls per cycle. To get back to a single call per cycle, raise `bulk_limit` above the rank of every configured ID — the bulk response is capped at 2000 rows, and a larger `limit` costs the same one call but a bigger payload.

## Coin admission at startup

Not every configured coin can be served within the quota, so admission is decided once at startup:

1. every coin whose rank falls inside `bulk_limit` is admitted, at no extra per-cycle cost
2. out-of-range and unranked coins are admitted up to `max_individual_requests`, preserving configuration order with explicit `ids` before `coins`
3. coins beyond that cap are **excluded** from requests and from source coverage for the whole run, and a single warning names them

```
CoinPaprika: excluded from this run because they exceed max_individual_requests=5: …
```

To reconsider excluded coins, raise `max_individual_requests` or `bulk_limit` and restart. A cap of `0` keeps only bulk-range coins, and disables the source for the run if none remain.

The same cap bounds the fallback requests used when a bulk response temporarily omits an admitted coin. A temporary gap does not remove the coin from the advertised coverage.

## Startup cost

The connector always downloads the `/v1/coins` directory (~1.4 MB gzipped), including when only `ids` are configured, because it needs ranks to decide admission. This happens once per start, not per cycle, and retries up to three times with a backoff.

## Terms

::: warning Redistribution is not included in the free plan
The CoinPaprika [plan matrix](https://docs.coinpaprika.com/api-plans) marks the Free plan as "Personal" usage with redistribution unavailable; redistribution is offered on the Enterprise plan only, and the paid Starter through Ultimate plans allow commercial usage without granting it.

- **Private or development instance, rates consumed by you**: permitted on the free plan
- **Public or commercial instance serving these rates onwards**: an Enterprise agreement is required, or set `"enabled": false`
:::

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Repeated `Unable to fetch valid data from CoinPaprika` | Monthly quota exhausted, or rate limiting from a very short `refreshInterval` |
| A configured coin never appears | Excluded at startup by `max_individual_requests`. The startup warning names it |
| `Could not fetch coin IDs for CoinPaprika after 3 attempts` | The directory download failed. Check outbound HTTPS and the quota |
| A coin resolves to the wrong asset | Symbol ambiguity. Configure the explicit ID instead |
