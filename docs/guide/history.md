# Rate history

Every successful refresh cycle writes a full snapshot of the current rate table to MongoDB. `/getHistory` reads those snapshots back by interval, by point in time, and by pair.

## What a snapshot contains

A snapshot is not "the quotes fetched in this cycle". It is **every pair considered current at that moment**, which includes pairs whose newest quote came from an earlier cycle but is still inside `rateLifetime`.

Two consequences:

- one snapshot timestamp can cover observations made at different times within the `rateLifetime` window
- a pair disappears from snapshots once its last quote ages out, not at the moment its provider fails

A snapshot is written only when at least one provider returned valid data and at least one pair survived merging. A complete provider outage leaves a **gap** in history rather than recording the cached rates as a fresh observation.

Triangulated cross-rates are stored alongside the directly quoted ones, so `ADM/EUR` is a real row and not something the API computes at read time.

## Storage layout

Two collections, written in this order and without a transaction:

| Collection | Document | Indexes |
| --- | --- | --- |
| `tickers` | `{ base, quote, rate, date }` | `{ date: 1 }`, `{ base: 1, date: -1 }`, `{ quote: 1, date: -1 }`, `{ base: 1, quote: 1, date: -1 }` |
| `timestamps` | `{ date }` | `{ date: 1 }`, unique |

`date` is a Unix timestamp in milliseconds, identical across every document of one snapshot.

`timestamps` is the registry of complete snapshots, and the `_id` returned by `/getHistory` is the `timestamps` document's `_id`. If the process dies between the two writes, a `tickers` group exists with no registry entry. Such an orphaned group is skipped by every history query instead of being returned as a partial snapshot, so a crash never produces a truncated result that looks complete.

### Why the indexes look like this

Every `/getHistory` filter sorts by `date`, so each index ends with it and the sort is served by the index rather than by a blocking in-memory sort. The leading fields are prefixes of these keys, which is why `{ base: 1 }`, `{ quote: 1 }`, and `{ base: 1, quote: 1 }` are not declared separately:

| Query shape | Index used |
| --- | --- |
| No `coin` filter | `{ date: 1 }` |
| `coin=ADM/` | `{ base: 1, date: -1 }` |
| `coin=/USD` | `{ quote: 1, date: -1 }` |
| `coin=ADM` | Both single-field indexes, merged as an `$or` |
| `coin=ADM/USD` | `{ base: 1, quote: 1, date: -1 }` |

A bare symbol is an `$or` over base and quote. Giving both branches a date-ordered index lets the planner merge them in sorted order instead of sorting the whole matching history before the cursor can stop.

Mongoose `autoIndex` creates any missing index when the service connects. On an existing large collection that is real I/O; build them out of band first, as described in [upgrade and rollback](./upgrading.md#412-to-420-index-rebuild).

## Querying

Full parameter documentation is in the [REST API reference](../reference/api.md#gethistory). The behaviour worth understanding here:

### Point-in-time lookups

`timestamp` returns the newest snapshot at or before the requested second.

When `timestamp` is combined with `coin`, the closest snapshot **that actually contains the requested pair** is returned, rather than the globally closest snapshot filtered afterwards. A request no longer comes back empty because the nearest snapshot happened not to carry that pair. Resolution walks backwards through candidate dates, validating each against the `timestamps` registry, for up to 50 candidates.

```http
GET /getHistory?timestamp=1720450000&coin=ADM/USD
```

### Interval queries

`from` and `to` are inclusive Unix timestamps in seconds. `from` greater than `to` is rejected with `400`.

```http
GET /getHistory?from=1720400000&to=1720470000&coin=ADM/USD&limit=50
```

Results are ordered newest first. `limit` defaults to and is capped at 100 snapshots. A single request scans at most 1000 snapshot groups, which bounds the work when a long run of snapshots is orphaned or filtered out.

### Pair filters

| Form | Selects |
| --- | --- |
| `coin=ADM` | Every pair where `ADM` is the base or the quote |
| `coin=ADM/` | Pairs where `ADM` is the base |
| `coin=/USD` | Pairs where `USD` is the quote |
| `coin=ADM/USD` | That exact pair |

Filters use the documented `BASE/QUOTE` order. Deployments upgrading from a version with the inverted historical filter must remove any client-side pair reversal workaround.

## Growth and retention

Each snapshot writes one document per current pair. The count grows with the product of the coins your sources cover and the number of `base_coins`:

```
documents per snapshot ≈ coins × base_coins
snapshots per day       = 1440 / refreshInterval
```

A default deployment — roughly 13 coins across 7 base coins, refreshed every 10 minutes — writes on the order of 130,000 ticker documents a day. Each is small, but the collection is append-only and nothing prunes it.

Currencyinfo has no built-in retention policy. Pick one deliberately:

- **Keep everything.** Simplest, and the collection stays queryable for years at this size
- **Lengthen `refreshInterval`.** Halving the write rate halves the growth, at the cost of resolution
- **Trim by age** with a scheduled job. Delete from both collections together, or you create orphans:

  ```js
  const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
  db.tickers.deleteMany({ date: { $lt: cutoff } });
  db.timestamps.deleteMany({ date: { $lt: cutoff } });
  ```

- **A TTL index** works too, but it must be created on both collections with the same expiry, and `date` is a number rather than a `Date`, so a TTL index does not apply without changing the stored type. Prefer the scheduled delete above

Back up before any bulk delete. See [backup](./upgrading.md#backup).

## Reading the collections directly

The layout is stable and documented, so external reporting can query MongoDB without going through the API:

```js
// The rate of one pair at each of the last 10 snapshots
db.tickers
  .find({ base: 'BTC', quote: 'USD' })
  .sort({ date: -1 })
  .limit(10);

// Every pair of one snapshot
db.tickers.find({ date: 1720472046060 });

// Snapshots that are complete
db.timestamps.find().sort({ date: -1 }).limit(5);
```

Always join through `timestamps` when completeness matters: a `tickers` group without a matching `timestamps` document is an interrupted write.
