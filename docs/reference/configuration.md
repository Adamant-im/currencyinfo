# Configuration reference

Every option Currencyinfo accepts, matching `config.default.jsonc` and the strict schema in `src/global/config/schema.ts`.

## The file

| Aspect | Detail |
| --- | --- |
| Format | JSONC — JSON with `//` and `/* */` comments and trailing commas |
| Location | `config.jsonc` in the process working directory |
| Template | `config.default.jsonc`, committed to the repository |
| Permissions | `600`, owned by the runtime user. It holds every credential |
| Git | `config.jsonc` and `config.test.jsonc` are git-ignored |

Resolution order:

1. `config.test.jsonc`, only under `NODE_ENV=development` or Jest
2. `config.jsonc`
3. `config.default.jsonc`, only under `NODE_ENV=development` or Jest

A production start with no `config.jsonc` is an error, not a fallback to the template.

## How validation behaves

The file is parsed and validated before the HTTP port is opened. Any failure prints a formatted report and exits non-zero.

- the schema is **strict**: an unknown key is an error. A typo cannot silently disable a source
- an enabled source that cannot work — missing key, empty coin list, an impossible quote asset — fails at startup rather than on every request
- the shipped credential placeholders are recognised and treated as **no credential at all**, so enabling a source without replacing one fails loudly. Placeholders from earlier templates and from Currencyinfo v1 are recognised too
- coin symbols are uppercased. `mappings` keys are uppercased as well, so a key differing only in case is not a silent no-op

---

## Core options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `name` | string | `"Currencyinfo"` | Instance name, prefixed to every notification |
| `decimals` | integer 0–100 | `12` | Decimal places every stored and served rate is rounded to |
| `strategy` | enum | — | How the winning group resolves to one rate. **Required** |
| `rateDifferencePercentThreshold` | number 0–200 | `25` | Maximum percentage distance between two quotes in the same group |
| `groupPercentage` | number 0–200 | — | Minimum percentage distance between the two heaviest groups. **Required** |
| `minSources` | positive integer | `1` | Upper bound on the sources required per pair |
| `priorities` | string array | — | Source resolution order for `strategy: "priority"`. **Required** |
| `refreshInterval` | positive number | `10` | Minutes between refresh cycles |
| `rateLifetime` | positive number | — | Minutes a quote stays usable. **Required** |
| `base_coins` | string array, non-empty | — | Currencies every rate is expressed in. **Required** |
| `mappings` | object | `{}` | Symbol rewrites applied everywhere |
| `log_level` | enum | `"log"` | `none`, `error`, `warn`, `log`, `info` |

### `strategy`

| Value | Result |
| --- | --- |
| `avg` | Arithmetic mean of the winning group's prices |
| `min` | Lowest price in the group |
| `max` | Highest price in the group |
| `priority` | Price from the source highest in `priorities` |
| `weight` | Price from the source with the highest `weight` |

### `rateDifferencePercentThreshold` and `groupPercentage`

Both are percentages measured against the mean of the two compared values, so both cap at 200.

- `rateDifferencePercentThreshold` set to `200` disables rate-distance splitting entirely: every quote lands in one group
- `groupPercentage` behaves the opposite way. `200` can never be exceeded, so every pair that splits into more than one group is rejected

The mechanics are worked through in [rate calculation](../guide/rate-calculation.md).

### `minSources`

An upper bound, not a guarantee. The effective threshold per pair is `min(minSources, number of enabled sources advertising that pair)`, so a pair offered by a single provider is still served from that one quote. Startup logs every pair whose coverage is below the configured value.

### `priorities`

An ordered list of connector names, highest priority first. Names must match exactly:

```
CurrencyApi   ExchangeRateApi   ExchangeRateHost   MOEX   Coinmarketcap
CryptoCompare   Coingecko   CoinPaprika   CoinLore   Binance
```

A source not in the list ranks below every listed source. The shipped default omits `CryptoCompare`, which is disabled by default; add it back when running with a subscription.

### `base_coins`

```jsonc
{
  "base_coins": ["USD", "RUB", "EUR", "CNY", "JPY", "BTC", "ETH"]
}
```

Connectors quote against USD, and every other base coin is triangulated from those quotes. A base coin no source quotes produces no cross-rates and is named in a startup warning.

### `mappings`

```jsonc
{
  "mappings": {
    "CWIF": "$CWIF"
  }
}
```

Rewrites a symbol into its canonical form in incoming quotes, in `base_coins`, and in the coverage map. Do not use it to alias a stablecoin to `USD` — see [symbol mappings](../guide/rate-calculation.md#symbol-mappings).

---

## `server`

```jsonc
{
  "server": {
    "port": 36661,
    "mongodb": {
      "host": "mongodb",
      "port": 27017,
      "db": "tickersdb"
    }
  }
}
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `server.port` | integer 0–65535 | `36661` | HTTP listen port |
| `server.mongodb.host` | string | `"127.0.0.1"` | Hostname. `mongodb` in the shipped Compose file, `127.0.0.1` for a local install |
| `server.mongodb.port` | integer 1–65535 | `27017` | MongoDB port |
| `server.mongodb.db` | string | `"tickersdb"` | Database name |

Connection is attempted once with a 2 second server-selection timeout and no retry, so a wrong host fails fast.

---

## `notify`

All fields are optional; omit the object entirely to disable every channel. Alerts still go to the log.

```jsonc
{
  "notify": {
    "slack": ["https://hooks.slack.com/services/T00000000/B00000000/REPLACE-WITH-YOUR-WEBHOOK-TOKEN"],
    "discord": ["https://discord.com/api/webhooks/000000000000000000/EXAMPLE-ONLY-not-a-real-token"],
    "adamantPassphrase": "example example example example example example example example example example example example",
    "adamant": ["U0000000000000000000"]
  }
}
```

| Option | Type | Validation |
| --- | --- | --- |
| `notify.slack` | string array | `https://hooks.slack.com/services/T…/B…/…` |
| `notify.discord` | string array | `https://discord.com/api/webhooks/<id>/<token>`, `discordapp.com` also accepted |
| `notify.adamant` | string array | `U` followed by 6 to 21 digits |
| `notify.adamantPassphrase` | string | Required when `notify.adamant` is non-empty |

Every value on this page is synthetic. See [notifications](../guide/notifications.md) for how to obtain real ones.

---

## Rate sources

Each source is an optional object. Common fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `enabled` | boolean | Whether the source is used |
| `weight` | non-negative number | Voting power when choosing the dominant group. Defaults to `10`; `0` means a quote with no vote |

::: warning `enabled` is not a plain default
For the authenticated sources — `exchange_rate_host`, `coinmarketcap`, `coingecko`, `cryptocompare` — an **omitted** `enabled` on a configured source is treated as enabled, and the source then requires its API key. Set it explicitly.

For `currency_api`, `exchange_rate_api`, and `moex` the schema is stricter still: when the block is present at all, both `enabled` and `url` are **required**. Delete the whole block to drop the source rather than emptying it.
:::

Beyond `enabled`, a source is only actually active when it has something to fetch: a non-empty coin or code list, and a real API key where one is required.

Per-provider quotas, terms, and behaviour are documented in the [source reference](./sources/). The schema shapes follow.

### `coinpaprika`

Keyless. Enabled by default.

```jsonc
{
  "coinpaprika": {
    "enabled": true,
    "coins": ["BTC", "ETH", "ADM"],
    "ids": ["btc-bitcoin", "eth-ethereum", "adm-adamant-messenger"],
    "bulk_limit": 200,
    "max_individual_requests": 5
  }
}
```

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `coins` | string array | — | Ticker symbols. Ambiguous on CoinPaprika; prefer `ids` |
| `ids` | string array | — | CoinPaprika coin IDs, the preferred form |
| `bulk_limit` | integer 1–2000 | `200` | Rows requested in the single ranked bulk call |
| `max_individual_requests` | integer 0–100 | `5` | Cap on per-coin calls for coins outside the bulk range |

At least one of `coins` or `ids` is required when enabled. [Details](./sources/coinpaprika.md)

### `coinlore`

Keyless. Enabled by default.

```jsonc
{
  "coinlore": {
    "enabled": true,
    "coins": ["BTC", "ETH", "ADM"],
    "ids": { "BTC": 90, "ETH": 80, "ADM": 33250 }
  }
}
```

| Field | Type | Description |
| --- | --- | --- |
| `coins` | string array | Symbols, resolved at startup from the asset directory when not in `ids` |
| `ids` | object of symbol to positive integer | CoinLore numeric IDs, the preferred form |

At least one of `coins` or `ids` is required when enabled. [Details](./sources/coinlore.md)

### `binance`

Keyless. Enabled by default.

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
| `quote_asset` | string | `"USDT"` | Asset the markets are quoted against, restricted to USD-pegged assets |
| `coins` | string array | — | Base symbols. Required when enabled, and must not contain `quote_asset` |

Accepted `quote_asset` values: `USD`, `USDT`, `USDC`, `FDUSD`, `USD1`, `USDS`, `TUSD`, `USDP`, `PYUSD`, `RLUSD`, `DAI`, `BUSD`. [Details](./sources/binance.md)

### `exchange_rate_api`

Keyless fiat. Enabled by default.

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
| `url` | HTTP(S) URL | Endpoint. The base currency is part of the path and must stay `USD` |
| `codes` | string array | Fiat codes to request. Required when enabled |

Fiat only. Crypto codes belong to the crypto sources. [Details](./sources/exchangerate-api.md)

### `currency_api`

Keyless fiat. Enabled by default.

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
| `url` | HTTP(S) URL | Endpoint returning USD-based rates |
| `codes` | string array | Codes to request. Required when enabled |

[Details](./sources/currency-api.md)

### `coingecko`

Needs a free Demo key. **Disabled by default.**

```jsonc
{
  "coingecko": {
    "enabled": false,
    "api_key": "Demo API key for CoinGecko",
    "coins": ["BTC", "ETH", "ADM"],
    "ids": ["bitcoin", "ethereum", "adamant-messenger"]
  }
}
```

| Field | Type | Description |
| --- | --- | --- |
| `api_key` | string | Free Demo plan key, sent as `x-cg-demo-api-key`. Required when enabled |
| `coins` | string array | Symbols. Ambiguous on CoinGecko; prefer `ids` |
| `ids` | string array | CoinGecko coin IDs, the preferred form |

[Details](./sources/coingecko.md)

### `coinmarketcap`

Needs an API key. **Disabled by default.**

```jsonc
{
  "coinmarketcap": {
    "enabled": false,
    "api_key": "API key for CoinMarketCap",
    "coins": ["BTC", "ETH", "ADM"],
    "ids": { "BTC": 1, "ETH": 1027, "ADM": 3703 }
  }
}
```

| Field | Type | Description |
| --- | --- | --- |
| `api_key` | string | Sent as `X-CMC_PRO_API_KEY`. Required when enabled |
| `coins` | string array | Symbols. Deprecated in favour of `ids` |
| `ids` | object of symbol to positive integer | CoinMarketCap UCIDs, the preferred form |

[Details](./sources/coinmarketcap.md)

### `exchange_rate_host`

Needs an API key. **Disabled by default.**

```jsonc
{
  "exchange_rate_host": {
    "enabled": false,
    "api_key": "API key for ExchangeRate",
    "codes": ["USD", "EUR", "RUB", "CNY", "JPY", "BTC"]
  }
}
```

| Field | Type | Description |
| --- | --- | --- |
| `api_key` | string | Sent as the `access_key` query parameter. Required when enabled |
| `codes` | string array | Codes to request. Required when enabled |

[Details](./sources/exchangerate-host.md)

### `moex`

Keyless. **Disabled by default.**

```jsonc
{
  "moex": {
    "enabled": false,
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
| `url` | HTTP(S) URL | Endpoint or proxy. Required |
| `codes` | object of pair to market code | Pairs to read. Required when enabled |

[Details](./sources/moex.md)

### `cryptocompare`

Subscription only. **Deprecated and disabled by default.**

```jsonc
{
  "cryptocompare": {
    "enabled": false,
    "api_key": "API key for CoinDesk Data (CryptoCompare)",
    "coins": ["USD", "EUR", "RUB", "BTC", "ETH", "ADM"]
  }
}
```

| Field | Type | Description |
| --- | --- | --- |
| `api_key` | string | CoinDesk Data key. Required when enabled; the free tier was retired on 21 May 2026 |
| `coins` | string array | Symbols. Required when enabled |

[Details](./sources/cryptocompare.md)

---

## Cross-field rules

Rules the schema enforces beyond individual field types:

| Rule | Message |
| --- | --- |
| `notify.adamant` non-empty implies a passphrase | `Provide passphrase to use ADAMANT notifier` |
| An enabled authenticated source needs its key | `Provide an API key when … is enabled` |
| CryptoCompare needs a CoinDesk Data key | `Provide a CoinDesk Data (former CryptoCompare) API key when CryptoCompare is enabled. The free tier was retired on 21 May 2026` |
| CoinGecko needs a Demo key | `Provide a free CoinGecko Demo API key when CoinGecko is enabled` |
| An enabled source needs something to fetch | `Provide at least one coin or ID when … is enabled` |
| `binance.quote_asset` must track the dollar | `'quote_asset' must be a USD-pegged asset: …` |
| `binance.coins` must not contain `binance.quote_asset` | `Remove '…' from the Binance coins: it is the configured quote asset and has no market against itself` |

---

## Placeholder credentials

These exact strings are recognised as placeholders and treated as absent, compared case-insensitively after trimming:

| Placeholder | Origin |
| --- | --- |
| `API key for ExchangeRate` | Current template |
| `API key for CoinMarketCap` | Current template |
| `API key for CoinDesk Data (CryptoCompare)` | Current template |
| `Demo API key for CoinGecko` | Current template |
| `apple banana...` | Current template, `notify.adamantPassphrase` |
| `API key for CryptoCompare` | Superseded template spelling |
| `Put yours CoinMarketCap API key` | Currencyinfo v1 |
| `Put yours CryptoCompare API key` | Currencyinfo v1 |
| `No need for CoinGecko API key` | Currencyinfo v1 |

An empty or whitespace-only value is also treated as absent, which is what Currencyinfo v1 used to mean "no key".

---

## Migrating a v1 configuration

```bash
pnpm run migrate ./config.json
```

The script writes `config.jsonc` beside the source file and never overwrites an existing one. It never leaves a source enabled that cannot work:

- CryptoCompare stays enabled only when the legacy `ccApiKey` is present, and the script reminds you to add `CryptoCompare` back to `priorities`
- CoinMarketCap stays enabled only when the legacy `cmcApiKey` is present
- CoinGecko is always disabled, because a v1 configuration carries no Demo key

Read every warning it prints: each one names a follow-up step.
