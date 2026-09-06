# Rate calculation

Several providers rarely agree on a price. This page describes exactly how Currencyinfo turns a set of disagreeing quotes into the single number it serves, and which knobs change that decision.

The pipeline runs once per refresh cycle, and again on demand whenever `/get` is called with a `rateLifetime` other than the configured one.

```
quotes per source
   └─▶ freshness filter        rateLifetime
       └─▶ grouping            rateDifferencePercentThreshold
           └─▶ dominant group  groupPercentage
               └─▶ strategy    strategy, priorities, weight
                   └─▶ coverage gate  minSources
                       └─▶ triangulation  base_coins
```

## Pair direction

A pair is always written `BASE/QUOTE`, and the value is how many quote units equal one base unit.

- `BTC/USD: 95120.45` means one bitcoin costs 95,120.45 US dollars
- `ADM/RUB: 2.65` means one ADM costs 2.65 roubles

This direction holds everywhere: in `/get` responses, in `/getHistory` responses, in the `coin` filter, and in the stored documents. Symbols are uppercased on the way in, both in configuration and in query parameters.

Connectors emit `<COIN>/USD` regardless of how the upstream quotes it. Providers that publish "units of X per 1 USD" — Currency API, ExchangeRate-API, ExchangeRate.host — are inverted inside their connector.

## Freshness: `rateLifetime`

Every quote is stamped with the minute it arrived. A quote takes part in merging only while it is younger than `rateLifetime` minutes, which the shipped configuration sets to 60.

This is what makes a provider outage survivable. When a source fails, its last good quote keeps contributing until it ages out, so a pair does not disappear the moment one provider has a bad minute. Once every quote for a pair is stale, the pair is dropped rather than served at an unknown age.

`rateLifetime` can be overridden per request:

```http
GET /get?rateLifetime=15
```

The override re-runs the whole pipeline against the stricter window, so it also tightens the coverage gate below: sources whose quotes fall outside the window no longer count towards `minSources`.

## Grouping: `rateDifferencePercentThreshold`

Quotes for a pair are sorted and split into groups. Two quotes belong to the same group when their percentage difference is at or below `rateDifferencePercentThreshold`, which defaults to 25.

The difference is measured against the mean of the two values:

```
difference = 100 × |a − b| / ((a + b) / 2)
```

That formula is symmetric, so the same pair of prices produces the same distance regardless of which one is larger, and it caps at 200 when one value approaches zero.

A group is built from each starting price and extended upwards while the distance from that starting price stays within the threshold. Groups therefore overlap: one quote can belong to more than one group.

Worked example with seven quotes and the default threshold of 25:

| Quotes | Group | Why |
| --- | --- | --- |
| `0.02`, `0.025` | Group A | 22.2% apart, inside the threshold. `0.03` is 40% from `0.02`, so it cannot join |
| `0.025`, `0.03`, `0.031` | Group B | `0.025` to `0.03` is 18.2%, `0.025` to `0.031` is 21.4% |
| `0.04`, `0.044`, `0.05` | Group C | `0.04` to `0.05` is 22.2% |

`0.031` and `0.04` are 25.35% apart, so groups B and C do not merge. `0.025` appears in both A and B.

Set `rateDifferencePercentThreshold` to `200` to disable splitting entirely: every quote lands in one group, and the strategy alone decides the rate.

## Choosing the dominant group: `groupPercentage`

Each group has a weight: the sum of the `weight` values of the sources contributing to it. Every source defaults to a weight of `10`, and any non-negative number may be configured per source. A weight of `0` means the source contributes a quote but no voting power.

The two heaviest groups are compared. The dominant group wins only when it is decisively heavier:

```
100 × |weight₁ − weight₂| / ((weight₁ + weight₂) / 2)  >  groupPercentage
```

- if there is only one group, it wins unconditionally
- if the top two groups are further apart than `groupPercentage`, the heavier one wins
- otherwise the pair is treated as unresolved: no new rate is stored, an alert is dispatched, and the previous rate keeps being served until it ages past `rateLifetime`

::: warning A correction to the retired wiki
The old wiki described `groupPercentage` as "the share of sources a group must contain". That is not what the code does. It is the minimum *relative distance between the weights of the two heaviest groups*, using the same mean-based percentage formula as the grouping step.
:::

Both extremes are useful:

- `groupPercentage: 0` accepts the heavier group unless the two are exactly tied. Maximum availability, minimum scrutiny
- `groupPercentage: 200` can never be exceeded, so every pair that splits into more than one group is rejected. Maximum scrutiny, and a guarantee that a served rate had no meaningful dissent

The default is `65`.

### Weights worked through

Continuing the example above, with weights assigned per source:

| Group | Members | Weight | Share |
| --- | --- | --- | --- |
| A | `0.02` (10), `0.025` (20) | 30 | 16% |
| B | `0.025` (20), `0.03` (50), `0.031` (60) | 130 | 65% |
| C | `0.04` (10), `0.044` (10), `0.05` (20) | 40 | 22% |

B and C are the two heaviest. Their distance is `100 × |130 − 40| / 85 = 105.9%`, which exceeds the default `65`, so group B wins and the strategy resolves a rate from `0.025`, `0.03`, and `0.031`.

Had B and C been 130 and 100, the distance would be 26%, below the threshold, and the pair would be rejected as ambiguous with an alert naming both groups and their sources.

## Resolving a rate: `strategy`

The strategy is applied to the members of the winning group only, never to the discarded ones.

| Strategy | Result |
| --- | --- |
| `avg` | Arithmetic mean of the group's prices |
| `min` | Lowest price in the group |
| `max` | Highest price in the group |
| `priority` | Price from the source highest in the `priorities` list |
| `weight` | Price from the source with the highest configured `weight` |

`priorities` is an ordered list of source names, highest priority first. A source that appears in the list ranks above every source that does not; unlisted sources all share the lowest rank, and ties are broken by the order the quotes were collected.

```jsonc
{
  "strategy": "priority",
  "priorities": [
    "ExchangeRateHost",
    "Coinmarketcap",
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

The names must match the connector names exactly. They are listed in the [source reference](../reference/sources/#connector-names).

`priority` and `weight` separate two decisions that are easy to conflate: `weight` decides which group is trusted, `priorities` decides which member of that group is quoted. Using `strategy: "priority"` lets you weight a slow-but-accurate provider heavily for the trust decision while still quoting a faster one.

## Coverage gate: `minSources`

`minSources` is the number of independent sources a pair should have before its rate is stored. It defaults to `1` in the schema and to `2` in the shipped configuration.

It is an upper bound, not a guarantee. At startup, Currencyinfo records for every pair how many enabled sources advertise it, capped at `minSources`:

```
effective threshold = min(minSources, sources advertising the pair)
```

A pair that only one provider quotes is still served from that one quote, and every pair below the configured value is named in a startup warning:

```
The following pairs have fewer enabled sources than the configured minimum
(minSources=2), but they are going to be saved anyway: XYZ/USD (1)
```

During a cycle the gate is checked against *fresh* quotes only, so a stale provider cannot satisfy it. A pair that drops below its effective threshold is not stored, and the cycle reports it:

```
The following rates have been fetched from fewer sources than expected and
therefore won't be saved: ADM/USD (expected 2, but got 1)
```

Raising `minSources` above the coverage of your source mix does not add safety; it only produces warnings. Add a source that quotes the pair instead.

## Base coins and triangulation

Connectors quote against USD. Every other base coin in `base_coins` is derived afterwards, from the USD rates that survived the pipeline:

```
COIN/BASE = (1 / (BASE/USD)) × (COIN/USD)
```

So `ADM/EUR` is computed from `ADM/USD` and `EUR/USD`, never fetched directly. This keeps every cross-rate internally consistent: `ADM/EUR × EUR/USD` always equals `ADM/USD` up to the configured `decimals`.

Consequences worth knowing:

- a base coin no source quotes produces no cross-rates, and startup warns about it by name
- a cross-rate that rounds to zero at the configured `decimals`, or that is not finite, is discarded rather than served
- `decimals` defaults to 12 and applies to every stored and served value

```jsonc
{
  "base_coins": ["USD", "RUB", "EUR", "CNY", "JPY", "BTC", "ETH"],
  "decimals": 12
}
```

USD is always available as a base because it is the pivot.

## Symbol mappings

Providers occasionally use a different ticker for the same asset. `mappings` rewrites a symbol into its canonical form everywhere: in incoming quotes, in `base_coins`, and in the coverage map.

```jsonc
{
  "mappings": {
    "CWIF": "$CWIF"
  }
}
```

Keys are matched case-insensitively, because every symbol is uppercased before lookup.

Do not use `mappings` to alias a stablecoin to `USD`. A `"USDT": "USD"` entry rewrites the genuine `USDT/USD` quote into a meaningless `USD/USD` and removes exactly the data that makes a depeg visible. The Binance connector handles its own USD substitution internally for this reason — see [Binance](../reference/sources/binance.md).

## Putting it together

A configuration for "quote the most conservative price, but only when the sources broadly agree, and never from fewer than three of them":

```jsonc
{
  "rateDifferencePercentThreshold": 15,
  "groupPercentage": 100,
  "strategy": "min",
  "minSources": 3,
  "rateLifetime": 30
}
```

- quotes more than 15% apart never share a group
- the dominant group must outweigh the runner-up by more than 100%, which in practice means the runner-up is a lone outlier
- among the trusted group, the lowest price is served
- a pair needs three fresh sources, where the mix provides them
- nothing older than half an hour is used

And the opposite, for maximum availability on a thin source mix:

```jsonc
{
  "rateDifferencePercentThreshold": 200,
  "groupPercentage": 0,
  "strategy": "avg",
  "minSources": 1,
  "rateLifetime": 120
}
```

## What happens when it fails

Every rejection is reported through the [notifier](./notifications.md), classified by how long it has persisted:

| Situation | Severity | Message |
| --- | --- | --- |
| Pair rejected, no previous rate to serve | `error` | "the rates won't be saved … and there are no previous rates to fall back on" |
| Pair rejected, previous rate already stale | `error` | "these errors have persisted for more than `rateLifetime` min" |
| Pair rejected, previous rate still fresh | `warn` | "the previously stored rates will be served … but they require attention" |
| Some sources unreachable this cycle | `warn` | Names the sources; fresh quotes from the others still apply |
| Every source unreachable | `error` | Nothing is written, and history gets a gap rather than a duplicate |

A gap in history is deliberate. Re-recording cached rates as a new observation would fabricate data points that no provider ever published.
