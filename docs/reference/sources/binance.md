# Binance

Keyless public spot market data, **enabled by default**. Binance is an exchange rather than an aggregator, which is why it is in the default set: it adds genuine source independence from CoinGecko, CoinMarketCap, CoinPaprika, and CoinLore, which partly share upstream data.

| Property | Value |
| --- | --- |
| Connector name | `Binance` |
| Config key | `binance` |
| Website | [binance.com](https://binance.com) |
| Endpoints | `api.binance.com/api/v3/exchangeInfo`, `api.binance.com/api/v3/ticker/price` |
| Credential | None |
| Covers | Cryptocurrencies listed on Binance spot, quoted against a stablecoin |
| Default weight | `10` |

## Configuration

```jsonc
{
  "binance": {
    "enabled": true,
    "quote_asset": "USDT",
    "coins": ["BTC", "ETH", "BNB", "XRP", "SOL", "DOGE", "ADA", "TRX", "LTC", "DASH"]
  }
}
```

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | |
| `weight` | number ≥ 0 | `10` | Voting power in group selection |
| `quote_asset` | string | `"USDT"` | Asset the markets are quoted against |
| `coins` | string array | — | Base symbols. Required when enabled |

`coins` must not contain `quote_asset`: there is no market of an asset against itself, and the configuration is rejected at startup with a message naming it.

ADM is not listed on Binance. ADM coverage comes from the aggregator sources.

## USDT stands in for USD, on purpose

Binance quotes no direct fiat USD pairs, only stablecoin ones. The connector requests `<COIN><quote_asset>` markets — `BTCUSDT` by default — and emits pairs already named `<COIN>/USD`, without converting anything.

This is a deliberate approximation with a known failure mode: **during a depeg every Binance rate is off by the depeg magnitude**.

### Why the substitution lives in the connector

It must not be expressed as a global `mappings` entry. A `"USDT": "USD"` mapping would apply to every source and rewrite the genuine `USDT/USD` quote returned by the aggregators into a degenerate `USD/USD`, dropping exactly the quote that makes a depeg observable.

`USDT/USD` and `USDC/USD` are in the aggregator source defaults for this reason: the peg itself stays visible in the served data whatever the grouping decides.

### `quote_asset` is restricted to USD-pegged assets

Because the connector relabels the quote rather than converting it, any non-USD asset turns the substitution into a unit error. `quote_asset: "BTC"` would serve the real `ETHBTC` price of ~0.03 as `ETH/USD`.

Accepted values:

```
USD  USDT  USDC  FDUSD  USD1  USDS  TUSD  USDP  PYUSD  RLUSD  DAI  BUSD
```

Anything else fails at startup. Switching to `USDC` needs no code change:

```jsonc
{
  "binance": { "quote_asset": "USDC" }
}
```

### What a depeg actually does

Whether a depeg raises an alert depends on your thresholds and source mix, and **the default settings do not catch a small one**.

Rates are grouped by `rateDifferencePercentThreshold`, computed as the difference over the mean, so at the default `25` a Binance quote stays in the same group as the honest ones until the peg falls to roughly `0.78`. Below that:

1. the Binance quotes split into their own group
2. `groupPercentage` decides whether the divergence is reported
3. `strategy` resolves the pair from the dominant group, which is the healthy one when Binance is outweighed

To tighten this:

- lower `rateDifferencePercentThreshold`
- keep at least two non-Binance sources for every pair Binance quotes
- alert on `USDT/USD` drifting from `1.0` in your own monitoring

See [rate calculation](../../guide/rate-calculation.md#grouping-ratedifferencepercentthreshold).

## Geo-restrictions

Binance geo-blocks some regions with HTTP `451 Unavailable For Legal Reasons`. The block is not transient, so retrying every cycle would produce an alert every `refreshInterval` forever.

Instead, on the first `451` the connector:

1. disables itself for the rest of the run
2. logs and dispatches **one** error naming the cause
3. lets the remaining sources keep serving

```
Binance answered HTTP 451 (unavailable for legal reasons): the API is geo-restricted
in this region. The source has been disabled for this run, restart the service to re-probe it.
```

Restarting re-probes availability. If your region is permanently blocked, set `"enabled": false` so the enabled-source count that `minSources` is measured against stays accurate.

## Cost per cycle

One request. `/api/v3/ticker/price?symbols=[…]` accepts an explicit market list and returns all of them at once. Binance's public rate limits are far above what one call per cycle needs.

At startup, one `exchangeInfo` call validates that every configured market exists and is trading. A configured coin with no market against the quote asset is dropped, with a log line.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `answered HTTP 451` | Geo-restricted region. Disable the source or route the deployment differently |
| A coin never appears | No `<COIN><quote_asset>` market on Binance spot, or the market is not trading |
| `provides rates against USD only` | An internal base other than USD was requested. Binance only serves the USD pivot |
| Every Binance rate is a few percent off | The quote asset has depegged. Check `USDT/USD` in `/get` |
