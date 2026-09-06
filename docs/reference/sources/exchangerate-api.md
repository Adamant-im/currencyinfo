# ExchangeRate-API

Keyless fiat provider, **enabled by default**. The open endpoint covers 166 currencies and updates once a day, with no signup.

::: info Not the same as ExchangeRate.host
`ExchangeRateApi` is the keyless `open.er-api.com` endpoint documented here. [`ExchangeRateHost`](./exchangerate-host.md) is an unrelated, key-requiring provider with a confusingly similar name.
:::

| Property | Value |
| --- | --- |
| Connector name | `ExchangeRateApi` |
| Config key | `exchange_rate_api` |
| Website | [exchangerate-api.com](https://www.exchangerate-api.com) |
| Endpoint | `open.er-api.com/v6/latest/USD` |
| Credential | None |
| Covers | 166 fiat currencies, updated daily |
| Default weight | `10` |

## Configuration

```jsonc
{
  "exchange_rate_api": {
    "enabled": true,
    "url": "https://open.er-api.com/v6/latest/USD",
    "codes": ["USD", "RUB", "EUR", "CNY", "JPY"]
  }
}
```

| Field | Type | Description |
| --- | --- | --- |
| `enabled` | boolean | **Required** when the block is present. `true` in the shipped template |
| `weight` | number ≥ 0 | Voting power in group selection, defaults to `10` |
| `url` | HTTP(S) URL | Endpoint. **Required** |
| `codes` | string array | Fiat codes to request. Required when enabled |

The block is validated as a whole: if `exchange_rate_api` is present, `enabled` and `url` must both be set. Delete the whole block to drop the source rather than emptying it.

## Fiat only

`BTC`, `ETH`, and other crypto assets are not covered by this endpoint and must not be listed in `codes`. The crypto sources quote them far more frequently and far more accurately.

## The base currency is part of the path

The connector inverts the upstream `rates` map — which is quoted as "units of X per 1 USD" — into `X/USD` pairs. A response quoted against anything other than USD would be mislabelled rather than converted, so `USD` must stay in the URL path. The connector verifies `base_code` in the response and refuses a mismatch.

## Errors arrive with HTTP 200

The endpoint answers `200` even on failure, and signals the outcome in the body:

```json
{ "result": "error", "error-type": "invalid-key" }
```

The connector treats `result` as the only reliable success indicator, so a failure is reported rather than parsed as an empty rate set.

## Update frequency

Once a day. Refreshing more often does not produce newer numbers; it only spends requests. This is normal for fiat: currency rates move slowly compared to crypto, and the divergence check against [Currency API](./currency-api.md) is what catches a bad one.

## Terms

::: warning Keyless access is not permission to republish
- **Private or development instance, rates consumed by you**: permitted, and attribution is required. Add a link to `https://www.exchangerate-api.com` where the rates are shown, reading "Rates By Exchange Rate API"
- **Public or commercial instance serving these rates onwards**: not permitted. Contact the provider for written redistribution permission, or set `"enabled": false`

See the provider's [free tier terms](https://www.exchangerate-api.com/docs/free).
:::

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| A code never appears | Not among the 166 supported currencies, or it is a crypto asset |
| Repeated fetch failures | The endpoint answered `result: "error"`. The log carries the `error-type` |
| Rates look a day old | They are. This endpoint updates once a day by design |
