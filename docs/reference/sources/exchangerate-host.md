# ExchangeRate.host

Commercial fiat, forex, precious metals, and Bitcoin provider. **Disabled by default** because it requires an API key.

::: info Not the same as ExchangeRate-API
`ExchangeRateHost` is the key-requiring `exchangerate.host` service documented here. [`ExchangeRateApi`](./exchangerate-api.md) is the unrelated keyless `open.er-api.com` endpoint.
:::

| Property | Value |
| --- | --- |
| Connector name | `ExchangeRateHost` |
| Config key | `exchange_rate_host` |
| Website | [exchangerate.host](https://exchangerate.host) |
| Endpoint | `api.exchangerate.host/live` |
| Credential | API key, sent as the `access_key` query parameter |
| Covers | World currencies, precious metals, Bitcoin |
| Default weight | `10` |

## Configuration

```jsonc
{
  "exchange_rate_host": {
    "enabled": true,
    "api_key": "your-exchangerate-host-key",
    "codes": ["USD", "EUR", "RUB", "CNY", "JPY", "BTC"]
  }
}
```

| Field | Type | Description |
| --- | --- | --- |
| `enabled` | boolean | Defaults to `false` in the shipped template. An **omitted** value on a configured source is treated as enabled |
| `weight` | number ≥ 0 | Voting power in group selection, defaults to `10` |
| `api_key` | string | Required when enabled |
| `codes` | string array | Codes to request. Required when enabled |

The supported symbol list is published at [exchangerate.host/currencies](https://exchangerate.host/currencies).

## Shape and direction

`/live` returns a `quotes` object keyed `USD<CODE>`, quoted as "units of CODE per 1 USD". The connector reads `USD<CODE>` for each configured code and inverts it into a `CODE/USD` pair.

## Update frequency

Spot data is sourced from several major forex providers and delivered hourly, every 10 minutes, or within a 60-second market window depending on the plan. Match `refreshInterval` to the plan you hold rather than to the fastest tier.

## Cost

One request per cycle covering every configured code. Roughly 4,500 calls a month at the default 10 minute interval; check that against your plan's monthly allowance.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Provide an API key when ExchangeRateHost is enabled` | Enabled without a key, or with the shipped placeholder still in place |
| `Provide at least one currency code when ExchangeRateHost is enabled` | Enabled with an empty `codes` list |
| A code never appears | Not supported by the plan, or absent from the `quotes` object |
| Repeated fetch failures | Invalid or expired key, or the monthly allowance is exhausted |
