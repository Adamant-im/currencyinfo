# REST API reference

Three read-only endpoints on the port configured as `server.port`, `36661` by default. No authentication, no versioned path prefix, no write operations.

```
GET /get          current rates
GET /getHistory   stored rate snapshots
GET /status       readiness and schedule
```

## Conventions

### Response envelope

Every successful response carries the same wrapper, with the endpoint's own fields merged in:

```json
{
  "success": true,
  "date": 1720472096540,
  "last_updated": 1720472046060,
  "version": "4.2.0"
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `success` | `boolean` | `true` on success |
| `date` | `number` | Server time when the response was produced, Unix milliseconds |
| `last_updated` | `number \| null` | When the last snapshot was stored, Unix milliseconds. `null` before the first one |
| `version` | `string` | Service version, `x.y.z` |

### Errors

```json
{
  "success": false,
  "date": 1720472096540,
  "msg": "Invalid coin name list"
}
```

| Status | Cause |
| --- | --- |
| `400` | Parameter validation failed. `msg` names the problem |
| `500` | Unexpected server error. `msg` is always `Something went wrong`; the detail is in the log, redacted |

`success: false` responses do not carry `last_updated` or `version`.

### Units and timestamps

| Where | Unit |
| --- | --- |
| `date`, `last_updated`, `next_update`, and the `date` of a history record | Unix **milliseconds** |
| `from`, `to`, `timestamp` request parameters | Unix **seconds** |
| `rateLifetime` request parameter | Minutes |

The asymmetry is preserved from earlier versions for compatibility. Request parameters are seconds; response timestamps are milliseconds.

### Pair order

A pair key is always `BASE/QUOTE`, and its value is how many quote units equal one base unit. `"BTC/USD": 95120.45` means one bitcoin costs 95,120.45 dollars.

This order is guaranteed in `/get` results, in `/getHistory` results, in the `coin` filter, and in the stored documents. The inverse pair, when present, is a separate key with its own value.

### Symbols

Symbols are uppercased before matching, so `coin=btc` and `coin=BTC` are the same request. Beyond case, they must match exactly: these are ticker symbols, not names.

Pair keys can contain characters beyond `A-Z0-9` when a provider uses them — `$CWIF` is a real example. Query filters accept the same wider set, so every stored pair is addressable.

---

## `/get`

Returns the current merged rates from the in-memory table.

```http
GET /get
GET /get?coin=ADM
GET /get?coin=ADM,BTC,ETH
GET /get?rateLifetime=30
GET /get?coin=BTC&rateLifetime=15
```

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `coin` | string | No | Comma-separated coin symbols. A pair is returned when **either** side matches |
| `rateLifetime` | number | No | Maximum age of a quote in minutes. Defaults to the configured `rateLifetime` |

Unknown parameters are rejected with `400`.

`coin` filters on either side of the pair, so `coin=USD` returns both `BTC/USD` and `USD/RUB`. It is a symbol list, not a pair list: `coin=ADM/USD` is invalid here. Use `/getHistory` for pair-shaped filters.

`rateLifetime` re-runs the whole merge pipeline against the stricter window rather than filtering the finished table. A shorter window therefore also tightens the `minSources` gate, because quotes outside the window stop counting as sources. See [rate calculation](../guide/rate-calculation.md#freshness-ratelifetime).

### Response

```json
{
  "success": true,
  "date": 1720472096540,
  "result": {
    "ADM/USD": 0.02978666,
    "ADM/RUB": 2.652919086307,
    "BTC/USD": 95120.45,
    "ETH/USD": 3420.12
  },
  "last_updated": 1720472046060,
  "version": "4.2.0"
}
```

`result` is an object keyed by pair. An empty object means no pair satisfied the filter and the freshness window; it is not an error.

### Validation errors

| `msg` | Cause |
| --- | --- |
| `Invalid coin name list` | `coin` is not a comma-separated list of valid symbols |
| `Invalid input: expected number, received NaN` | `rateLifetime` is not numeric |
| `Too small: expected number to be >0` | `rateLifetime` is zero or negative |
| `Unrecognized key: "…"` | An unknown query parameter was sent |

### Examples

```bash
# Everything currently available
curl -s "http://localhost:36661/get"

# One coin, every pair it appears in
curl -s "http://localhost:36661/get?coin=ADM"

# Several coins
curl -s "http://localhost:36661/get?coin=ADM,BTC,ETH"

# Only quotes from the last 15 minutes
curl -s "http://localhost:36661/get?coin=BTC&rateLifetime=15"
```

---

## `/getHistory`

Returns stored snapshots. **At least one parameter is required**; a bare call is a `400`.

```http
GET /getHistory?coin=ADM&limit=10
GET /getHistory?coin=ADM/USD&from=1720400000&to=1720470000
GET /getHistory?timestamp=1720450000
GET /getHistory?timestamp=1720450000&coin=/EUR
```

### Parameters

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `coin` | string | No | A symbol or a pair filter, see the table below |
| `from` | number | No | Range start, Unix **seconds**, inclusive |
| `to` | number | No | Range end, Unix **seconds**, inclusive |
| `timestamp` | number | No | Point in time, Unix **seconds**. Resolves to the newest snapshot at or before it |
| `limit` | number | No | Maximum snapshots returned. Positive integer, capped at 100, defaults to 100 |

At least one of them must be present. Unknown parameters are rejected.

#### `coin` filter forms

| Form | Selects |
| --- | --- |
| `ADM` | Every pair where `ADM` is the base **or** the quote |
| `ADM/` | Pairs where `ADM` is the base |
| `/USD` | Pairs where `USD` is the quote |
| `ADM/USD` | That exact pair |

#### Combining parameters

- `from` and `to` together bound a range. `from > to` is a `400`
- `timestamp` alone returns the single newest snapshot at or before it
- `timestamp` with `coin` returns the newest snapshot at or before it **that contains the requested pair**, rather than the globally newest one filtered afterwards. A request no longer comes back empty because the closest snapshot happened not to carry that pair
- `timestamp` with `from` and `to` resolves inside that window
- `limit` applies to snapshots, not to pairs

### Response

```json
{
  "success": true,
  "date": 1720472096540,
  "result": [
    {
      "_id": "5cd7299fff5980058cebdceb",
      "date": 1720471800000,
      "tickers": {
        "ADM/USD": 0.03011223,
        "ADM/RUB": 1.96115985,
        "ADM/EUR": 0.02688229,
        "ADM/BTC": 0.00000478
      }
    }
  ],
  "last_updated": 1720472046060,
  "version": "4.2.0"
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `result` | array | Snapshots, newest first |
| `result[].\_id` | string | MongoDB identifier of the snapshot's registry document |
| `result[].date` | number | Snapshot time, Unix milliseconds |
| `result[].tickers` | object | Pairs of that snapshot, filtered by `coin` when given |

An empty `result` array means nothing matched. It is not an error.

::: tip A snapshot is not "the quotes from that cycle"
It is every pair considered current at that moment, including pairs whose newest quote came from an earlier cycle but is still inside `rateLifetime`. See [rate history](../guide/history.md#what-a-snapshot-contains).
:::

Snapshots whose registry entry is missing — an interrupted write — are skipped rather than returned as partial. A single request scans at most 1000 snapshot groups, and point-in-time resolution examines at most 50 candidate dates.

### Validation errors

| `msg` | Cause |
| --- | --- |
| `At least one parameter is required` | No parameters were given |
| `Invalid input` | `coin` does not match any supported symbol or pair form |
| `Timestamp is too large` | A timestamp exceeds the safe range. These are seconds, not milliseconds |
| `Invalid time interval: 'to' timestamp must be greater than or equal to 'from'` | `from > to` |
| `Too small: expected number to be >0` | `limit` is zero or negative |
| `Unrecognized key: "…"` | An unknown query parameter was sent |

### Examples

```bash
# Last 10 snapshots containing ADM
curl -s "http://localhost:36661/getHistory?coin=ADM&limit=10"

# One pair across a range
curl -s "http://localhost:36661/getHistory?coin=ADM/USD&from=1720400000&to=1720470000"

# The rate at a moment in time
curl -s "http://localhost:36661/getHistory?timestamp=1720450000&coin=BTC/USD"

# Everything quoted in EUR at a moment in time
curl -s "http://localhost:36661/getHistory?timestamp=1720450000&coin=/EUR"
```

---

## `/status`

Readiness and schedule. Takes no parameters and always returns `200` while the process is alive, so read the body.

```http
GET /status
```

### Response

```json
{
  "success": true,
  "date": 1720472096540,
  "ready": true,
  "updating": false,
  "next_update": 1720472646060,
  "last_updated": 1720472000000,
  "version": "4.2.0"
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `ready` | `boolean` | A snapshot has been stored at least once since startup |
| `updating` | `boolean` | A refresh cycle is running at this moment |
| `next_update` | `number` | When the next refresh is scheduled, Unix milliseconds. Before the first snapshot this is the process start time |
| `last_updated` | `number \| null` | When the last snapshot was stored, or `null` |

::: warning `updating` is not an overdue indicator
After a failed cycle the service is idle and reports `updating: false` until the next scheduled attempt. Compare `next_update` against your own clock to detect a stalled schedule.
:::

Before the first successful cycle:

```json
{
  "success": true,
  "date": 1720929107999,
  "ready": false,
  "updating": true,
  "next_update": 1720929107763,
  "last_updated": null,
  "version": "4.2.0"
}
```

See [health and readiness](../guide/operations.md#health-and-readiness) for probes and staleness alerting.

---

## Compatibility

The response shapes on this page are stable within the 4.x series. Snapshot `_id` values are preserved across the 4.0 to 4.1 database migration, so a client holding an old identifier keeps resolving it.

One behaviour changed in 4.2.0: historical `coin` filters now use the documented `BASE/QUOTE` order. Deployments that carried a client-side pair reversal workaround for the previously inverted filter must remove it.
