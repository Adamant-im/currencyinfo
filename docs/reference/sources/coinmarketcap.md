# CoinMarketCap

Broad crypto aggregator with most endpoints updating every minute. **Disabled by default** because it requires a paid API key.

| Property | Value |
| --- | --- |
| Connector name | `Coinmarketcap` |
| Config key | `coinmarketcap` |
| Website | [coinmarketcap.com](https://coinmarketcap.com) |
| Endpoint | `pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest` |
| Credential | API key, sent as `X-CMC_PRO_API_KEY` |
| Covers | Cryptocurrencies, quoted against USD |
| Default weight | `10` |

## Configuration

```jsonc
{
  "coinmarketcap": {
    "enabled": true,
    "api_key": "your-coinmarketcap-key",
    "ids": {
      "BTC": 1,
      "ETH": 1027,
      "ADM": 3703
    }
  }
}
```

| Field | Type | Description |
| --- | --- | --- |
| `enabled` | boolean | Defaults to `false` in the shipped template. An **omitted** value on a configured source is treated as enabled |
| `weight` | number ≥ 0 | Voting power in group selection, defaults to `10` |
| `api_key` | string | Required when enabled |
| `coins` | string array | Ticker symbols. Deprecated, prefer `ids` |
| `ids` | object of symbol to positive integer | CoinMarketCap UCIDs, the preferred form |

At least one of `coins` or `ids` is required when enabled.

Find the UCID on the coin's page, for example `3703` at [coinmarketcap.com/currencies/adamant-messenger](https://coinmarketcap.com/currencies/adamant-messenger/).

## `ids` avoids a startup call

Configuring `ids` addresses coins directly. Configuring `coins` instead makes the connector resolve symbols to UCIDs at startup with an extra API call, and ticker symbols on CoinMarketCap are not unique. Use `ids`.

## Cost

| When | Calls |
| --- | --- |
| Startup | 1, only when `coins` is configured |
| Per cycle | 1 `quotes/latest` call covering every configured ID |

Each additional `convert` target beyond the first costs an extra call credit on CoinMarketCap's side. Currencyinfo requests USD only and triangulates the rest, so a cycle costs one credit's worth of conversion.

## Plans

The free Basic plan carries a monthly credit budget and does not include every endpoint. At the default `refreshInterval` of 10 minutes a cycle is ~4,500 calls a month, which exceeds the Basic plan's typical allowance. Check your plan's credit budget against your interval before enabling.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Provide an API key when CoinMarketCap is enabled` | Enabled without a key, or with the shipped placeholder still in place |
| `Unable to get all of N coin rates` | The key is invalid, the plan does not cover the endpoint, or the credit budget is exhausted |
| `Unable to get ticker for Coinmarketcap symbol '…'` | The symbol is not listed. Configure the UCID instead |
| A coin resolves to the wrong asset | Symbol collision. Configure the UCID |
