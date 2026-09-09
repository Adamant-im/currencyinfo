# MOEX

Moscow Exchange market data for fiat currency pricing. Keyless, but **disabled by default**.

| Property | Value |
| --- | --- |
| Connector name | `MOEX` |
| Config key | `moex` |
| Website | [moex.com](https://moex.com) |
| Direct endpoint | `iss.moex.com/iss/engines/currency/markets/selt/securities.jsonp` |
| Default endpoint | `rusdoor.adamant.im/securities.jsonp`, a proxy refreshed every 3 minutes |
| Credential | None |
| Covers | Fiat pairs against RUB |
| Default weight | `10` |

## Why it is disabled by default

Two reasons:

- **USD and EUR trading on MOEX has been prohibited since June 2024**, so those quotes are likely outdated
- MOEX quotes everything against RUB rather than USD, so it cannot contribute to the USD pivot the rest of the pipeline is built on, except through the `USD/RUB` cross it publishes

It remains useful for a deployment where RUB pairs matter and where a Moscow Exchange reference price is wanted alongside the international sources.

## Configuration

```jsonc
{
  "moex": {
    "enabled": true,
    "url": "https://rusdoor.adamant.im/securities.jsonp",
    "codes": {
      "USD/RUB": "USDRUB_TOM",
      "EUR/RUB": "EURRUB_TOM",
      "CNY/RUB": "CNYRUB_TOM"
    }
  }
}
```

| Field | Type | Description |
| --- | --- | --- |
| `enabled` | boolean | **Required** when the block is present. `false` in the shipped template |
| `weight` | number ≥ 0 | Voting power in group selection, defaults to `10` |
| `url` | HTTP(S) URL | Endpoint or proxy. **Required** |
| `codes` | object of pair to market code | Pairs to read. **Required**, and non-empty when enabled |

The block is validated as a whole: if `moex` is present, `enabled`, `url`, and `codes` must all be set. Delete the whole block to drop the source rather than emptying it.

The default URL is a Russian proxy, because MOEX may block requests from some countries. It refreshes its copy every 3 minutes. Point `url` at the direct ISS endpoint if you can reach it.

## How rates are derived

The connector reads the `CETS` board rows, takes the midpoint of the two published prices for each configured market code, and then:

- `USD/RUB` becomes `RUB/USD` by inversion, which is how RUB enters the USD pivot
- every other `X/RUB` pair is stored as-is, **and** cross-converted into `X/USD` using the `USD/RUB` midpoint
- `JPY/RUB` is divided by 100, because MOEX quotes it per 100 yen

Without a `USD/RUB` entry in `codes`, only the raw `X/RUB` pairs are produced and nothing reaches the USD pivot.

## Cost

One request per cycle. No key, no quota.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Provide at least one market code when MOEX is enabled` | Enabled with an empty `codes` object |
| Repeated fetch failures | The proxy is unreachable, or the direct ISS endpoint blocks your region |
| A pair never appears | The market code is wrong, or its row carries no usable price |
| USD or EUR rates look stale | They are. Trading them on MOEX has been prohibited since June 2024 |
