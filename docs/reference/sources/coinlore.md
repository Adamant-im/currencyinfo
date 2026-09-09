# CoinLore

Keyless crypto aggregator, **enabled by default**. No registration, no key, and no strict published rate limit.

| Property | Value |
| --- | --- |
| Connector name | `CoinLore` |
| Config key | `coinlore` |
| Website | [coinlore.com](https://coinlore.com) |
| Endpoints | `api.coinlore.net/api/ticker/`, `api.coinlore.net/api/assets/` |
| Credential | None |
| Covers | Cryptocurrencies, one USD quote per coin |
| Default weight | `10` |

## Configuration

```jsonc
{
  "coinlore": {
    "enabled": true,
    "coins": ["BTC", "ETH", "ADM"],
    "ids": {
      "BTC": 90,
      "ETH": 80,
      "BNB": 2710,
      "XRP": 58,
      "SOL": 48543,
      "DOGE": 2,
      "ADA": 257,
      "TRX": 2713,
      "LTC": 1,
      "DASH": 8,
      "USDT": 518,
      "USDC": 33285,
      "ADM": 33250
    }
  }
}
```

| Field | Type | Description |
| --- | --- | --- |
| `enabled` | boolean | Defaults to `true` |
| `weight` | number ≥ 0 | Voting power in group selection, defaults to `10` |
| `coins` | string array | Ticker symbols, resolved at startup when not covered by `ids` |
| `ids` | object of symbol to positive integer | CoinLore numeric IDs, the preferred form |

At least one of `coins` or `ids` is required when enabled.

Find an ID in the response of [`api.coinlore.net/api/tickers/`](https://api.coinlore.net/api/tickers/).

## Stale IDs are rejected, not trusted

CoinLore's numeric IDs are **reassigned across listings**. An ID that pointed at one asset can later point at another, which would silently quote the wrong price.

The connector defends against this: every returned row carries its symbol, and a row whose symbol does not match the symbol the ID was configured for is rejected at runtime. A stale ID produces a missing rate and a log line rather than a wrong rate.

## Cost per cycle

One request. `/api/ticker/?id=90,80,33250` accepts a comma-separated ID list and returns a bare array of rows, so the whole coin set is covered in a single call — up to 100 IDs per request, which covers any realistic configuration in one or two calls.

CoinLore states no strict rate limit and recommends roughly one request per second, which a single call per cycle stays far below.

## Startup cost

The `/api/assets/` directory (~0.4 MB gzipped) is downloaded **only when a configured symbol is not covered by `ids`**. An `ids` map covering every configured symbol skips the request entirely.

The directory is used rather than the quoted listing because `/api/tickers/` is hard-capped at 100 rows per page — `limit=500` and `limit=1000` both return exactly 100 rows, silently ignoring the requested value — so resolving a low-ranked symbol such as ADM (rank ~1066) from it would cost eleven paged requests. The directory carries `id`, `symbol`, `name`, `nameid`, and `rank` for all ~15,000 coins in one response.

## Response quirks

CoinLore serialises every numeric field as a string, including `id` and `price_usd`. The connector converts them, and a value that is not a positive finite number is dropped rather than served.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| A configured coin never appears | Its symbol was not found in the asset directory, or the configured ID's symbol does not match |
| `Could not fetch coin IDs for CoinLore after 3 attempts` | The directory download failed. Configure `ids` to skip it entirely |
| A rate disappears after a provider relisting | The numeric ID was reassigned. Look the coin up again and update `ids` |
