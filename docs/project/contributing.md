# Contributing

Currencyinfo is open source under the [GPL-3.0 License](https://github.com/Adamant-im/currencyinfo/blob/master/LICENSE) and maintained by the ADAMANT developer community. Contributions are welcome from anyone.

The authoritative contributor guide is [`CONTRIBUTING.md`](https://github.com/Adamant-im/currencyinfo/blob/master/CONTRIBUTING.md) in the repository. This page is the orientation version.

## What changes protect

Changes must preserve, in this order:

1. **Calculation accuracy** — rate precision, pair direction, inverse triangulation
2. **Merging reliability** — deterministic behaviour under provider outages and disagreement
3. **Security** — no credential ever reaches a log, an error payload, or a commit
4. **Contributor clarity** — modular NestJS structure, typed code, tests that describe behaviour

Everything in the repository is written in English: code, comments, documentation, commits, issues, and pull requests.

## Development setup

```bash
git clone https://github.com/Adamant-im/currencyinfo.git
cd currencyinfo
git switch develop
pnpm install --ignore-scripts
pnpm run deps:setup
cp config.default.jsonc config.jsonc
```

`--ignore-scripts` is not optional. It blocks lifecycle scripts across the whole dependency tree; `deps:setup` then rebuilds `@swc/core` alone, which is the one package that genuinely needs a native build step.

A local MongoDB for development:

```bash
docker compose up -d
```

Then run the service with file watching, which prefers `config.test.jsonc` and falls back to `config.default.jsonc`:

```bash
pnpm run start:dev
```

## Validation

Run all four before opening a pull request, and report the results in the description:

```bash
pnpm run build
pnpm test
pnpm run lint
pnpm run format:check
```

For documentation changes, also:

```bash
pnpm run docs:build
```

`docs:build` fails on a dead internal link, which is the check that keeps this site honest.

Pull requests must include tests for new features and bug fixes. Tests live beside the code they cover as `*.spec.ts`.

## Working on the documentation

The site lives in `docs/` and is a [VitePress](https://vitepress.dev) project.

```bash
pnpm run docs:dev      # local server with hot reload
pnpm run docs:build    # production build, fails on dead internal links
pnpm run docs:preview  # serve the built output
```

| Path | Contents |
| --- | --- |
| `docs/.vitepress/config.mts` | Site config, navigation, sidebar, search |
| `docs/index.md` | Home page |
| `docs/guide/` | Narrative documentation |
| `docs/reference/` | API, configuration, and per-source reference |
| `docs/project/` | Contributor and project pages |
| `docs/public/` | Static assets and the Pages `CNAME` |

Rules that apply to every page:

- documentation follows the code. If they disagree, the code is right and the page is a bug
- an option documented here must exist in `src/global/config/schema.ts` and in `config.default.jsonc`
- credentials in examples must be unmistakably synthetic. Never paste a real webhook URL, key, or passphrase
- adding a page means adding it to the sidebar in `docs/.vitepress/config.mts`
- follow the Markdown conventions in [`AGENTS.md`](https://github.com/Adamant-im/currencyinfo/blob/master/AGENTS.md): a blank line around every list, a language tag on every fenced block, and no trailing period on a single-sentence list item

Every page carries an "Edit this page on GitHub" link that opens the right file.

## Branches and pull requests

- base your work on `develop` and target `develop`. `master` represents stable releases
- name branches by type: `feat/short-description`, `fix/…`, `docs/…`, `chore/…`
- use Conventional Commits style for the PR title: `Type: Short summary`, for example `Feat: Add support for new fiat provider`
- issue-style prefixes such as `[Docs]` are for issues, not for PR titles
- link the issue with a closing keyword: `Closes #123`
- follow the PR template: `Description`, `Related issue`, `Breaking changes`, `How to test`, `Notes for reviewers`, `Checklist`

Keep pull requests focused. Unrelated refactoring and formatting churn make review harder and are usually asked to be split out.

## Adding a rate source

A new connector is the most common substantial contribution. What it takes:

1. a class in `src/rates/sources/api/` extending `BaseApi`, or `CoinIdFetcher` when the provider needs coin discovery
2. registration in `src/rates/sources/sources-manager.ts`
3. a schema entry in `src/global/config/schema.ts`, including any cross-field rule the source needs
4. a documented block in `config.default.jsonc`, with the terms and the quota spelled out
5. a `*.spec.ts` covering the success path, a malformed response, and the failure mode
6. a page under `docs/reference/sources/`, plus rows in the [source index](../reference/sources/) tables

Design rules the existing connectors follow:

- emit `<COIN>/USD` pairs. USD is the pivot; the merger triangulates everything else
- never throw for a condition the operator cannot fix this cycle. Disable the source and alert once, as Binance does for a geo-block
- verify provider identifiers. IDs get reassigned and symbols collide; both have caused real incidents
- document the quota and derive the safe `refreshInterval` from it
- state the redistribution terms explicitly if keyless access does not include them

## Dependencies

- install with `pnpm install --ignore-scripts`, never with `--ignore-scripts=false`
- review package names, maintainers, release dates, and lifecycle scripts before adding or updating anything
- keep `pnpm-lock.yaml` committed and synchronized
- revisit `pnpm.overrides` in `package.json` on every dependency update, and drop an override once upstream ships the patched version

## Reporting issues

Search [existing issues](https://github.com/Adamant-im/currencyinfo/issues) first, then open one with a prefix such as `[Bug]`, `[Feat]`, `[Enhancement]`, `[Docs]`, `[Test]`, or `[Chore]`.

Include the version from `/status`, how it is deployed, the relevant log lines, and your configuration **with every credential redacted**.

Security issues go privately to `devs@adamant.im` instead — see [security](../guide/security.md#reporting-a-vulnerability).

## Financial contribution

Cryptocurrency donations are welcome at [ADAMANT Donate](https://adamant.im/donate).
