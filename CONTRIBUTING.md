# Contributing to ADAMANT Currencyinfo

Thank you for improving `currencyinfo`. Changes should protect calculation accuracy, rate merging reliability, service security, and contributor clarity.

## Before you start

- Search [existing issues](https://github.com/Adamant-im/currencyinfo/issues) before opening a new one
- Use a concise issue prefix such as `[Bug]`, `[Feat]`, `[Refactor]`, `[Docs]`, `[Test]`, or `[Chore]`
- Base work on `develop` and target `develop` in pull requests; `master` represents stable releases
- Keep rate calculation, triangulation, and merging logic deterministic and robust against provider outages
- Never commit or log webhook URLs, API keys, passphrases, or sensitive configuration values

All repository artifacts—including code, comments, documentation, commits, issues, and pull requests—must be written in English.

## Development setup

Use Node.js 22 or newer and pnpm:

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

Also check dependencies and security when relevant:

```bash
pnpm audit
```

Review `pnpm.overrides` in `package.json` with every dependency update to minimize forced overrides as upstream packages adopt patched releases.

Report the exact commands run and any skipped or blocked validation in the pull request.

## Advanced pull request tips

- Focus pull requests on the intended change only and avoid unrelated refactoring or formatting changes to unrelated files
- Ensure changes maintain backward data compatibility with existing MongoDB databases and API endpoints

## Project structure

- `src/rates/`: REST controllers, rate fetch scheduler, MongoDB persistence, and cache
- `src/rates/merger/`: core rates merging engine, divergence detection, and strategy resolvers
- `src/rates/sources/`: data source manager and external API connectors (CoinGecko, CoinMarketCap, CryptoCompare, CurrencyAPI, ExchangeRate.host, MOEX)
- `src/global/`: global configuration loader and schema, custom Winston logger, and notifier modules
- `src/shared/`: shared Zod schema types and formatting utilities
- `scripts/`: configuration and database migration utilities

## Pull requests

- Use a PR title in Conventional Commits style: `Type: Short summary` (for example, `Feat: Add support for new fiat provider`)
- Target the `develop` branch for all development pull requests
- Link related issues explicitly in the PR description (for example, `Closes #123`)
- Follow the pull request template structure (`Description`, `Related issue`, `Breaking changes`, `How to test`, `Notes for reviewers`, `Checklist`)
- Ensure all tests, linter checks, and builds pass cleanly before requesting review

## Financial contribution

We also welcome financial contributions via cryptocurrency. See [ADAMANT Donate](https://adamant.im/donate).
