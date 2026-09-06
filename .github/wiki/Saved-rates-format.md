# Saved rates format — moved

> [!IMPORTANT]
> This page is **deprecated** and no longer updated. The maintained documentation is at **<https://currencyinfo.docs.adamant.im/guide/history>**.

- [Rate history](https://currencyinfo.docs.adamant.im/guide/history) — what a snapshot contains, the MongoDB collections and indexes, retention, and reading the collections directly
- [Pair direction](https://currencyinfo.docs.adamant.im/guide/rate-calculation#pair-direction) — `BASE/QUOTE` semantics
- [Base coins and triangulation](https://currencyinfo.docs.adamant.im/guide/rate-calculation#base-coins-and-triangulation) — how cross-rates are derived
- [Symbol mappings](https://currencyinfo.docs.adamant.im/guide/rate-calculation#symbol-mappings) — the `mappings` option

## What changed since this page was written

- This page said USD is the only base coin by default. The shipped `config.default.jsonc` configures **seven**: `USD`, `RUB`, `EUR`, `CNY`, `JPY`, `BTC`, and `ETH`
- The new documentation explains that a snapshot is **every pair considered current**, not only the pairs quoted in that cycle
- Storage layout, index design, and retention guidance are documented, none of which this page covered
