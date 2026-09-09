# Rate life time — moved

> [!IMPORTANT]
> This page is **deprecated** and no longer updated. The maintained documentation is at **<https://currencyinfo.docs.adamant.im/guide/rate-calculation#freshness-ratelifetime>**.

- [Freshness: `rateLifetime`](https://currencyinfo.docs.adamant.im/guide/rate-calculation#freshness-ratelifetime) — how long a quote stays usable, and the per-request override
- [Coverage gate: `minSources`](https://currencyinfo.docs.adamant.im/guide/rate-calculation#coverage-gate-minsources) — how freshness interacts with the source-count requirement
- [`GET /get`](https://currencyinfo.docs.adamant.im/reference/api#get) — the `rateLifetime` query parameter

## What changed since this page was written

- A `rateLifetime` override on `/get` **re-runs the whole merge pipeline** against the stricter window rather than filtering the finished table, so it also tightens the `minSources` gate
- The fallback to a previous rate applies **only while that quote is still inside `rateLifetime`**. Once every quote for a pair is stale, the pair is dropped rather than served at an unknown age
