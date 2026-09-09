# Documentation map

Where everything lives, and where the retired GitHub Wiki content went.

## This site

| Topic | Page |
| --- | --- |
| Product overview, positioning, use cases, ADAMANT adoption | [What is Currencyinfo](../guide/) |
| Components, startup sequence, refresh cycle, storage model | [Architecture](../guide/architecture.md) |
| Docker-first first run | [Quick start](../guide/quick-start.md) |
| Container image, source install, systemd, v1 migration | [Installation](../guide/installation.md) |
| Backup, upgrade, rollback, index rebuild, database migration | [Upgrade and rollback](../guide/upgrading.md) |
| Pair direction, grouping, divergence, weights, strategies, `minSources`, `rateLifetime`, triangulation | [Rate calculation](../guide/rate-calculation.md) |
| Snapshot semantics, collections, indexes, retention | [Rate history](../guide/history.md) |
| Slack, Discord, ADAMANT Messenger setup | [Notifications](../guide/notifications.md) |
| Reverse proxy, TLS, health checks, logs, resources | [Operations](../guide/operations.md) |
| Credentials, validation, container hardening, scanning, disclosure | [Security](../guide/security.md) |
| Symptom-first diagnosis | [Troubleshooting](../guide/troubleshooting.md) |
| `/get`, `/getHistory`, `/status` | [REST API reference](../reference/api.md) |
| Every configuration option | [Configuration reference](../reference/configuration.md) |
| Every connector, quota, and terms | [Rate sources](../reference/sources/) |
| Contributor guide | [Contributing](./contributing.md) |
| Versioning, channels, deprecations | [Release notes](./releases.md) |

## Elsewhere

| Resource | Location |
| --- | --- |
| Landing page | [currencyinfo.dev](https://currencyinfo.dev) |
| Source code | [github.com/Adamant-im/currencyinfo](https://github.com/Adamant-im/currencyinfo) |
| Release notes | [github.com/Adamant-im/currencyinfo/releases](https://github.com/Adamant-im/currencyinfo/releases) |
| Container image | [ghcr.io/adamant-im/currencyinfo](https://github.com/Adamant-im/currencyinfo/pkgs/container/currencyinfo) |
| Issue tracker | [github.com/Adamant-im/currencyinfo/issues](https://github.com/Adamant-im/currencyinfo/issues) |
| Contributor guide in the repository | [`CONTRIBUTING.md`](https://github.com/Adamant-im/currencyinfo/blob/master/CONTRIBUTING.md) |
| AI agent operating manual | [`AGENTS.md`](https://github.com/Adamant-im/currencyinfo/blob/master/AGENTS.md) |
| Umbrella ADAMANT documentation | [docs.adamant.im](https://docs.adamant.im) |

## Retired GitHub Wiki

The GitHub Wiki is **deprecated**. Its content has been migrated here, corrected against the current code, and its pages now carry a notice pointing at the canonical destination so existing deep links keep working.

| Former wiki page | Canonical destination | What changed in migration |
| --- | --- | --- |
| `Home` | [Documentation map](./documentation-map.md) | Split into this map, the [upgrade guide](../guide/upgrading.md), and the [v1 migration section](../guide/installation.md#migrating-from-currencyinfo-v1) |
| `Installation` | [Installation](../guide/installation.md) | Node.js requirement corrected from v20 to v22; the published container image replaces build-from-source as the recommended path; the stale `.github/CONTRIBUTING.md` link corrected |
| `API-specification` | [REST API reference](../reference/api.md) | Example port corrected from `36668` to the real default `36661`; `rateLiftime` typo corrected to `rateLifetime`; versions in examples updated; validation errors, units, and pair-order guarantees added |
| `Saved-rates-format` | [Rate history](../guide/history.md) and [pair direction](../guide/rate-calculation.md#pair-direction) | Corrected: `base_coins` in the shipped template is a full list including `USD`, not "USD only by default"; snapshot and storage semantics added |
| `Dealing-with-Rate-Differences-from-Multiple-Sources` | [Rate calculation](../guide/rate-calculation.md) | **Corrected**: `groupPercentage` is the minimum relative distance between the two heaviest group weights, not "the share of sources a group must contain". Source names in examples updated to the current connector set |
| `Rate-life-time` | [Freshness](../guide/rate-calculation.md#freshness-ratelifetime) | Corrected: the fallback applies while a quote is inside `rateLifetime`, and its interaction with the `minSources` gate is documented |
| `Notifications` | [Notifications](../guide/notifications.md) | **Secret-shaped examples replaced with unmistakably synthetic placeholders.** Validation rules and the placeholder-detection behaviour added |

The wiki is kept as a tombstone so existing inbound links resolve. It receives no further updates; open a documentation issue or a pull request against `docs/` instead.
