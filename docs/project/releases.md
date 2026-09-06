# Release notes and versioning

## Where the notes live

Release notes are published on GitHub, one entry per tag:

**[github.com/Adamant-im/currencyinfo/releases](https://github.com/Adamant-im/currencyinfo/releases)**

Each entry lists the changes, any migration step, and the container tags published from it. Subscribe by watching the repository with **Custom → Releases**.

## Versioning

Currencyinfo follows semantic versioning, applied to the operator-facing contract rather than to internal code:

| Change | Bump |
| --- | --- |
| REST response shape, configuration schema, or stored document layout changes incompatibly | Major |
| New source, new option, new endpoint behaviour that older clients can ignore | Minor |
| Bug fix, dependency update, documentation correction | Patch |

Within a major version:

- `/get`, `/getHistory`, and `/status` response shapes stay compatible
- stored documents stay readable, and any migration is documented and scripted
- an existing configuration keeps working, except where an upstream provider forces a change. The exception is announced in the release notes and carries a documented migration

::: warning 4.2.0 is such an exception
A stock 4.1.2 configuration does **not** start on 4.2.0. CryptoCompare retired its free tier and CoinGecko's keyless plan became unusable, so both sources now require an API key, and validation rejects the old file before the HTTP port opens. See [configuration migration](../guide/upgrading.md#412-to-420-configuration-migration).
:::

## Release channels

| Channel | Branch | Container tag |
| --- | --- | --- |
| Stable | `master` | `x.y.z`, `x.y`, `x`, and `latest` |
| Development | `develop` | Not published |

Images are published only from a reviewed release whose tag is an ancestor of `master`. Nothing is published from `develop`, from an unreviewed commit, or from an arbitrary workflow run. Pre-releases never move `latest`.

## Deprecations

A source or option scheduled for removal is:

1. disabled by default and documented as deprecated, with the reason and the replacement
2. kept working for operators who still need it, for at least one minor release
3. removed in a major release

The current deprecation is [CryptoCompare](../reference/sources/cryptocompare.md), disabled by default since its free tier was retired on 21 May 2026 and scheduled for removal in the next major release.

## Upgrading

Read [upgrade and rollback](../guide/upgrading.md) before moving between versions. Three upgrades need explicit steps:

- **4.1.2 → 4.2.0** needs a [configuration migration](../guide/upgrading.md#412-to-420-configuration-migration) before the version changes. This one is mandatory: skipping it restarts the service into a validation failure
- **4.1.2 → 4.2.0** also rebuilds the `tickers` indexes. Build them out of band first on a large history collection
- **4.0.x → 4.1.0** changes the stored document layout and needs `scripts/migrate-db.mjs`

## Security releases

A `critical` or `high` finding with an available fix in the application's own dependency tree is addressed in a patch release. Base-image findings without an upstream fix are documented in the release notes rather than silently carried. See the [vulnerability scanning policy](../guide/security.md#vulnerability-scanning-policy).
