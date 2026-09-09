# API specification — moved

> [!IMPORTANT]
> This page is **deprecated** and no longer updated. The maintained API reference is at **<https://currencyinfo.docs.adamant.im/reference/api>**.

- [`GET /get`](https://currencyinfo.docs.adamant.im/reference/api#get) — current merged rates
- [`GET /getHistory`](https://currencyinfo.docs.adamant.im/reference/api#gethistory) — stored snapshots by interval, point in time, or pair
- [`GET /status`](https://currencyinfo.docs.adamant.im/reference/api#status) — readiness and refresh schedule

## What changed since this page was written

- The examples on this page used port **`36668`**. The default port is **`36661`**
- The `/get` parameter is **`rateLifetime`**, not `rateLiftime`
- Historical `coin` filters use the documented **`BASE/QUOTE`** order. A deployment carrying a client-side pair reversal workaround must remove it
- The new reference documents **validation errors, units, freshness semantics, and pair-order guarantees**, none of which this page covered
- `timestamp` combined with `coin` now resolves to the closest snapshot **that contains the requested pair**, instead of the globally closest snapshot filtered afterwards
