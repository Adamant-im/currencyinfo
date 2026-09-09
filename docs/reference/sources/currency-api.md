# Currency API

Keyless open-data fiat provider, **enabled by default**. A community-maintained dataset published as static JSON on a CDN, with no key, no signup, and no rate limit.

| Property | Value |
| --- | --- |
| Connector name | `CurrencyApi` |
| Config key | `currency_api` |
| Project | [fawazahmed0/exchange-api](https://github.com/fawazahmed0/exchange-api) |
| Default endpoint | `cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json` |
| Credential | None |
| Covers | Fiat currencies, updated once a day |
| Default weight | `10` |

## Configuration

```jsonc
{
  "currency_api": {
    "enabled": true,
    "url": "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
    "codes": ["USD", "EUR", "RUB", "CNY", "JPY"]
  }
}
```

| Field | Type | Description |
| --- | --- | --- |
| `enabled` | boolean | **Required** when the block is present. `true` in the shipped template |
| `weight` | number ≥ 0 | Voting power in group selection, defaults to `10` |
| `url` | HTTP(S) URL | Endpoint returning a USD-based rates object. **Required** |
| `codes` | string array | Codes to request. Required when enabled |

The block is validated as a whole: if `currency_api` is present, `enabled` and `url` must both be set. Delete the whole block to drop the source rather than emptying it.

## Shape and direction

The endpoint returns a single object keyed by lowercase currency code under a `usd` key, quoted as "units of X per 1 USD". The connector lowercases each configured code for the lookup and inverts the value into an `X/USD` pair.

The URL must therefore point at the USD dataset. Pointing it at another base currency would mislabel every rate rather than convert it.

## Mirrors

The dataset is published to several CDNs. If jsDelivr is blocked or slow, swap the URL:

```jsonc
{
  "currency_api": {
    "url": "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json"
  }
}
```

```jsonc
{
  "currency_api": {
    "url": "https://latest.currency-api.pages.dev/v1/currencies/usd.json"
  }
}
```

Check the [project README](https://github.com/fawazahmed0/exchange-api) for the current list of mirrors and for the pinned-date URL form, which is worth using if you want reproducible historical behaviour rather than `@latest`.

## Update frequency

Once a day. Fiat rates are advised; the dataset does list crypto assets, but a once-a-day crypto quote is not useful next to the crypto sources, and it drags the merged rate towards a stale value.

## Cost per cycle

One request to a CDN. No quota, no key, no rate limit that a per-cycle request could reach.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| A code never appears | Not present in the dataset, or misspelled. Codes are matched lowercased against the upstream keys |
| Repeated fetch failures | The CDN is unreachable. Try a mirror |
| Rates look a day old | They are. This dataset updates once a day by design |
