# CryptoCompare

::: danger Deprecated and disabled by default
CryptoCompare, now **CoinDesk Data**, retired its free API tier on **21 May 2026**. `min-api.cryptocompare.com` answers `401` without a paid subscription, and so does `data-api.cryptocompare.com`.

The connector is kept for operators who hold a subscription. **Full removal is planned for the next major release.**
:::

| Property | Value |
| --- | --- |
| Connector name | `CryptoCompare` |
| Config key | `cryptocompare` |
| Website | [developers.coindesk.com](https://developers.coindesk.com) |
| Endpoint | `min-api.cryptocompare.com/data/pricemulti` |
| Credential | CoinDesk Data subscription key, sent as the `api_key` query parameter |
| Covers | Cryptocurrencies and fiat |
| Default weight | `10` |

## What changed

Before the shutdown, `cryptocompare.enabled` was `true` by default with an optional key. After it, that configuration failed on every refresh cycle:

```bash
curl "https://min-api.cryptocompare.com/data/pricemulti?fsyms=BTC,ETH&tsyms=USD"
# HTTP 401 {"Err":{"message":"API key required, please refer to the documentation at https://developers.coindesk.com/"}}
```

The consequences on a default install were worse than a missing source:

- the connector threw every cycle, the source landed in `unavailableSources`, and a warning went to Slack, Discord, and ADAMANT every `refreshInterval`
- it still counted as an enabled source at startup, so with `minSources: 2` every pair covered only by CoinGecko and CryptoCompare reported `expected 2, but got 1` and was not saved
- with CoinMarketCap and ExchangeRate.host also key-gated, free crypto coverage collapsed to CoinGecko alone

Three keyless crypto sources — [CoinPaprika](./coinpaprika.md), [CoinLore](./coinlore.md), and [Binance](./binance.md) — now cover the same coins with no credential.

## Current defaults

- `cryptocompare.enabled` is `false`
- `CryptoCompare` is **absent** from the default `priorities` list
- the API key is **mandatory** when enabled, not optional as it was before

## Enabling it with a subscription

1. Obtain a key from [CoinDesk Data](https://developers.coindesk.com)
2. Set `cryptocompare.api_key`
3. Set `cryptocompare.enabled` to `true`
4. Add `"CryptoCompare"` back to `priorities` at the position you want, otherwise it ranks below every listed source

```jsonc
{
  "cryptocompare": {
    "enabled": true,
    "api_key": "your-coindesk-data-key",
    "coins": ["USD", "EUR", "RUB", "CNY", "JPY", "BTC", "ETH", "ADM"]
  },
  "priorities": [
    "ExchangeRateHost",
    "Coinmarketcap",
    "CryptoCompare",
    "Coingecko",
    "CoinPaprika",
    "CoinLore",
    "Binance",
    "ExchangeRateApi",
    "CurrencyApi",
    "MOEX"
  ]
}
```

| Field | Type | Description |
| --- | --- | --- |
| `enabled` | boolean | Defaults to `false` in the shipped template. An **omitted** value on a configured source is treated as enabled |
| `weight` | number ≥ 0 | Voting power in group selection, defaults to `10` |
| `api_key` | string | Required when enabled |
| `coins` | string array | Ticker symbols. Required when enabled |

## Migrating a v1 configuration

`pnpm run migrate` keeps CryptoCompare enabled only when the legacy `ccApiKey` is present, and prints a reminder to add `CryptoCompare` back to `priorities`. Without a key it disables the source and names the free replacements.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Provide a CoinDesk Data (former CryptoCompare) API key when CryptoCompare is enabled` | Enabled without a key, or with the shipped placeholder still in place |
| `401` on every cycle | No subscription. The free tier is gone; disable the source |
| A warning every `refreshInterval` | The source is enabled and failing. Set `"enabled": false` |
