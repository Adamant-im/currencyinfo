# CoinGecko

Broad crypto aggregator, refreshed every 1 to 5 minutes. **Disabled by default** because it requires a free Demo plan key.

| Property | Value |
| --- | --- |
| Connector name | `Coingecko` |
| Config key | `coingecko` |
| Website | [coingecko.com](https://coingecko.com) |
| Endpoints | `api.coingecko.com/api/v3/coins/list`, `api.coingecko.com/api/v3/simple/price` |
| Credential | Free Demo plan key, sent as `x-cg-demo-api-key` |
| Covers | Cryptocurrencies, quoted against USD |
| Default weight | `10` |

## Why it is disabled by default

The keyless public plan is throttled to 5–15 calls per minute and rate limits unpredictably, which produces a source that fails intermittently rather than one that works. The free Demo plan gives **10,000 calls per month at 100 calls per minute** and needs no credit card, so requiring the key is strictly better than shipping an unreliable keyless source.

## Enabling it

1. Create a key at the [CoinGecko developer dashboard](https://www.coingecko.com/en/developers/dashboard)
2. Put it in `coingecko.api_key`
3. Set `coingecko.enabled` to `true`
4. Optionally add `Coingecko` to `priorities` at the position you want

```jsonc
{
  "coingecko": {
    "enabled": true,
    "api_key": "CG-your-demo-key",
    "ids": [
      "bitcoin",
      "ethereum",
      "binancecoin",
      "ripple",
      "solana",
      "dogecoin",
      "cardano",
      "tron",
      "litecoin",
      "dash",
      "tether",
      "usd-coin",
      "adamant-messenger"
    ]
  }
}
```

| Field | Type | Description |
| --- | --- | --- |
| `enabled` | boolean | Defaults to `false` in the shipped template. An **omitted** value on a configured source is treated as enabled |
| `weight` | number ≥ 0 | Voting power in group selection, defaults to `10` |
| `api_key` | string | Demo plan key. Required when enabled |
| `coins` | string array | Ticker symbols. Ambiguous, prefer `ids` |
| `ids` | string array | CoinGecko coin IDs, the preferred form |

At least one of `coins` or `ids` is required when enabled.

Find the API ID on the coin's page, for example `adamant-messenger` at [coingecko.com/en/coins/adamant-messenger](https://www.coingecko.com/en/coins/adamant-messenger).

## Prefer `ids` over `coins`

CoinGecko lists tens of thousands of assets and ticker symbols collide constantly. A symbol lookup takes the first match in the directory, which is not necessarily the asset you meant. Configure IDs.

## Cost

| When | Calls |
| --- | --- |
| Startup | 1 `/coins/list` directory download |
| Per cycle | 1 `/simple/price` call covering every configured ID |

Roughly 4,300 calls per month at the default `refreshInterval` of 10 minutes, well inside the 10,000 Demo quota. A 5 minute interval is about 8,700 and still fits; below that, the quota becomes the constraint.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Provide a free CoinGecko Demo API key when CoinGecko is enabled` | Enabled without a key, or with the shipped placeholder still in place |
| Repeated fetch failures with `429` | Rate limited. Check the key is being sent, and lengthen `refreshInterval` |
| `Unable to get ticker for Coingecko id '…'` | The ID does not exist. Check it on the coin's page |
| A symbol resolves to the wrong asset | Symbol collision. Configure the explicit ID |
