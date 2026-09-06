# Contributing to Currencyinfo

Thank you for improving `currencyinfo`. Changes should protect calculation accuracy, rate merging reliability, service security, and contributor clarity.

Currencyinfo is a universal, self-hosted exchange rates service maintained by the ADAMANT developer community. Treat any change that makes it harder to run outside ADAMANT as a regression.

- Documentation: <https://currencyinfo.docs.adamant.im>
- Landing page: <https://currencyinfo.dev>
- Container image: `ghcr.io/adamant-im/currencyinfo`

## Before you start

- Search [existing issues](https://github.com/Adamant-im/currencyinfo/issues) before opening a new one
- Use a concise issue prefix such as `[Bug]`, `[Feat]`, `[Refactor]`, `[Docs]`, `[Test]`, or `[Chore]`
- Base work on `develop` and target `develop` in pull requests; `master` represents stable releases
- Keep rate calculation, triangulation, and merging logic deterministic and robust against provider outages
- Never commit or log webhook URLs, API keys, passphrases, or sensitive configuration values

All repository artifacts—including code, comments, documentation, commits, issues, and pull requests—must be written in English.

## Development setup

Use Node.js 22.12 or newer and pnpm. The service itself runs on any Node.js 22, but the documentation toolchain resolves Vite 8 and Rolldown, which require `^20.19.0 || >=22.12.0`:

```bash
git clone https://github.com/Adamant-im/currencyinfo.git
cd currencyinfo
git switch develop
pnpm install --ignore-scripts
pnpm run deps:setup
```

Copy the default configuration file:

```bash
cp config.default.jsonc config.jsonc
```

### Running MongoDB with Docker

To start a local MongoDB instance for development:

```bash
docker compose up -d
```

Create a dedicated branch and keep commits compatible with Conventional Commits:

```bash
git switch -c feat/short-description
```

## Validation

Pull requests must include tests for new features and bug fixes. Run the complete baseline verification before submitting:

```bash
pnpm run build
pnpm test
pnpm run lint
pnpm run format:check
```

When the change touches documentation, also run:

```bash
pnpm run docs:build
pnpm run docs:links
```

`docs:build` fails on a dead internal link inside the site, and `docs:links` checks relative links and heading anchors across every Markdown file in the repository.

Also check dependencies and security when relevant:

```bash
pnpm audit
```

Review `pnpm.overrides` in `package.json` with every dependency update to minimize forced overrides as upstream packages adopt patched releases.

Report the exact commands run and any skipped or blocked validation in the pull request.

## Database migration

The `scripts/migrate-db.mjs` script migrates legacy pre-4.x ticker documents to the current schema. To prevent exposing database credentials in shell history or the operating system process list, run the migration using one of these secure methods:

- Run interactively in a terminal (input is masked and not echoed):

```bash
pnpm exec node scripts/migrate-db.mjs
```

- Load the connection string from a protected environment file or secret store:

```bash
# Sourced from a restricted environment file
set -a && source /path/to/.env.protected && set +a
pnpm exec node scripts/migrate-db.mjs

# Loaded dynamically from a secret file or vault
MIGRATE_DB_URL="$(< /run/secrets/mongo_uri)" pnpm exec node scripts/migrate-db.mjs
```

## Advanced pull request tips

- Focus pull requests on the intended change only and avoid unrelated refactoring or formatting changes to unrelated files
- Ensure changes maintain backward data compatibility with existing MongoDB databases and API endpoints

## Project structure

- `src/rates/`: REST controllers, rate fetch scheduler, MongoDB persistence, and cache
- `src/rates/merger/`: core rates merging engine, divergence detection, and strategy resolvers
- `src/rates/sources/`: data source manager and external API connectors (Binance, CoinGecko, CoinLore, CoinMarketCap, CoinPaprika, CryptoCompare, Currency API, ExchangeRate-API, ExchangeRate.host, MOEX)
- `src/global/`: global configuration loader and schema, custom Winston logger, and notifier modules
- `src/shared/`: shared Zod schema types and formatting utilities
- `scripts/`: configuration and database migration utilities, and the Markdown link checker
- `docs/`: the VitePress documentation site published to <https://currencyinfo.docs.adamant.im>
- `.github/workflows/`: documentation checks and deployment, container build and smoke test, GHCR publication

## Documentation

The documentation site is version-controlled in `docs/` and is the canonical technical reference. The GitHub Wiki is deprecated and kept only as a tombstone; do not add content to it or link to it.

```bash
pnpm run docs:dev      # local server with hot reload
pnpm run docs:build    # production build, fails on dead internal links
pnpm run docs:preview  # serve the built output
```

| Path | Contents |
| --- | --- |
| `docs/.vitepress/config.mts` | Site config, navigation, sidebar, search |
| `docs/guide/` | Narrative documentation |
| `docs/reference/` | REST API, configuration, and per-source reference |
| `docs/project/` | Contributor and project pages |
| `docs/public/` | Static assets and the GitHub Pages `CNAME` |

Rules:

- documentation follows the code. If they disagree, the code is right and the page is a bug
- an option documented on the site must exist in `src/global/config/schema.ts` and in `config.default.jsonc`
- credentials in examples must be unmistakably synthetic. Never write a plausible webhook URL, API key, or passphrase
- adding a page means adding it to the sidebar in `docs/.vitepress/config.mts`
- no analytics, tracking, or third-party telemetry may be added to the site

## Adding a rate source

A new connector needs all of these in one pull request:

1. a class in `src/rates/sources/api/` extending `BaseApi`, or `CoinIdFetcher` when the provider needs coin discovery
2. registration in `src/rates/sources/sources-manager.ts`
3. a schema entry in `src/global/config/schema.ts`, including any cross-field rule the source needs
4. a documented block in `config.default.jsonc`, stating the quota and the redistribution terms
5. a `*.spec.ts` covering the success path, a malformed response, and the failure mode
6. a page under `docs/reference/sources/`, plus rows in the tables of `docs/reference/sources/index.md` and the `README.md` source lists

Design rules the existing connectors follow:

- emit `<COIN>/USD` pairs; USD is the pivot and the merger triangulates everything else
- never throw for a condition the operator cannot fix this cycle. Disable the source and alert once, as the Binance connector does for a geo-block
- verify provider identifiers: IDs get reassigned and ticker symbols collide
- document the quota and derive a safe `refreshInterval` from it

## Pull requests

- Use a PR title in Conventional Commits style: `Type: Short summary` (for example, `Feat: Add support for new fiat provider`)
- Target the `develop` branch for all development pull requests
- Link related issues explicitly in the PR description (for example, `Closes #123`)
- Follow the pull request template structure (`Description`, `Related issue`, `Breaking changes`, `How to test`, `Notes for reviewers`, `Checklist`)
- Ensure all tests, linter checks, and builds pass cleanly before requesting review

## Financial contribution

We also welcome financial contributions via cryptocurrency. See [ADAMANT Donate](https://adamant.im/donate).
