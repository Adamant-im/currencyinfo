# ADAMANT Currencyinfo: AI Agent Operating Manual

This document defines how AI agents must work in this repository.

## Mission

`currencyinfo` is a self-hosted crypto and fiat currency exchange rates service provider for the ADAMANT ecosystem and external integrators. It fetches, validates, normalizes, and merges rates from multiple public and authenticated sources, stores historical rates in MongoDB, and serves them via a RESTful API.

Agent output must optimize for:

1. Reliability and calculation accuracy (rate precision, correct inverse pair triangulation, resilient merging strategies, robust error handling during external API outages)
2. Security (strict protection of webhook credentials, passphrases, and API keys; strict input and config validation)
3. Decentralization and self-hostability (lightweight resource footprint, configurable data sources, no single point of failure)
4. Open-source maintainability and contributor clarity (modular NestJS design, clean TypeScript typing, full test coverage)

If tradeoffs are required, preserve reliability, rate calculation accuracy, and security first.

## Language Policy

- Developers may communicate with AI in any language
- All repository artifacts must be in English only
- Write all code, comments, documentation, commit messages, PR descriptions, and issues in English

## Writing Style and Markdown Rules

- In bullet and numbered lists, do not add a trailing period when an item contains one sentence
- If an item contains two or more sentences, end every sentence with a period
- For every Markdown list, keep one blank line before the list and one blank line after the list
- Always keep a blank line between a heading and the list that follows it to satisfy MD032 (`blanks-around-lists`)
- Use fenced code blocks with matching opening and closing fences and include a language tag (`bash`, `ts`, `json`, `jsonc`)
- Keep descriptions operational, concise, and technical rather than promotional

## Project Positioning and Values

ADAMANT is a decentralized, anonymous, community-driven communication and transaction infrastructure.

`currencyinfo` serves exchange rate data across the ecosystem:

- Keep rate provision verifiable, transparent, and multi-sourced
- Avoid dependence on any single centralized rate provider
- Keep local resource requirements minimal so independent operators can self-host easily
- Keep user tracking, analytics, and telemetry at zero by default

## Sources of Truth

Use these sources when implementing or reviewing changes:

- This repository: `README.md`, `config.default.jsonc`, current code, and passing tests
- ADAMANT Node guidelines baseline: https://github.com/Adamant-im/adamant/blob/master/AGENTS.md
- ADAMANT Messenger guidelines: https://github.com/Adamant-im/adamant-im/blob/master/AGENTS.md
- ADAMANT Console guidelines: https://github.com/Adamant-im/adamant-console/blob/master/AGENTS.md
- Org-wide issue/label governance: https://github.com/Adamant-im/.github
- Recommended issue title prefixes: https://github.com/orgs/Adamant-im/discussions/5
- Recommended labels for issues/discussions: https://github.com/orgs/Adamant-im/discussions/1
- Canonical coin and node specifications: `adamant-wallets` repository (`assets/general/adamant/info.json`)
- Official documentation: https://docs.adamant.im

If sources disagree:

1. Treat current repository code and passing tests as implementation truth
2. Do not silently ignore mismatches; document them and propose synchronized updates

## Issue, Label, and PR Conventions

Follow organization-wide conventions:

- Governance repository: `Adamant-im/.github`
- Source of truth for labels: `Adamant-im/.github/labels.json`

### Issue creation workflow

When creating an issue:

1. Check existing open issues first to avoid duplicates
2. Use org task/issue structure (`Summary`, `Details`, `Checklist`, `Notes`, `Verification`)
3. Use a concise prefixed title
4. Apply labels from org catalog (`labels.json`)
5. Link related PRs and issues explicitly

### Issue title prefixes (one or two maximum)

- `[Bug]` — bug, crash, calculation error, unexpected behavior
- `[Feat]` — new functionality
- `[Enhancement]` — improvement of existing functionality
- `[Refactor]` — internal refactoring without behavior change
- `[Docs]` — documentation updates
- `[Test]` — testing additions and improvements
- `[Chore]` — maintenance and routine technical tasks
- `[Task]` — general task (including operational or release work)
- `[Composite]` — multi-part task with sub-tasks
- `[Security]` — vulnerability fixes or security enhancements

### Label policy

- Apply a minimal but informative set:
  - one type label (`Task`, `bug`, `enhancement`, `Composite task`, `documentation`)
  - one or more domain labels (`TypeScript`, `NodeJS`, `APIs`, `DB`, `Security`, `Guideline`, `Infrastructure`, `Integration`)
  - optional priority label (`High priority`) when necessary
- Preserve label casing as defined in org catalog (default GitHub labels are lowercase; custom labels are Capitalized)

### PR title and linking conventions

- Use Conventional Commits style for PR titles: `Type: Short summary` (for example: `Docs: Add AGENTS.md`)
- Do not use issue-style square-bracket prefixes in PR titles (`[Docs]`, `[Bug]`, etc. are reserved for Issues)
- Target the `develop` branch for all development pull requests (never submit PRs directly against `master`)
- Reference issues in the PR body with closing keywords where appropriate (`Closes #123`)
- Follow the org PR template structure (`Description`, `Related issue`, `Breaking changes`, `How to test`, `Notes for reviewers`, `Checklist`)

### Working with Command-Line Tools

When CLI tools accept multi-line input, always use temporary files in `.ai-ignored/` instead of inline multi-line shell strings:

```bash
gh issue create \
  --title "[Docs] Add AI Agent Operating Manual (AGENTS.md)" \
  --body-file .ai-ignored/temp.YYYY-MM-DD.issue-body.md \
  --label "documentation,Guideline,TypeScript,NodeJS,Task"

gh pr create \
  --base develop \
  --title "Docs: Add AI Agent Operating Manual" \
  --body-file .ai-ignored/temp.YYYY-MM-DD.pr-description.md
```

Benefits:

- Eliminates quoting and shell escaping issues
- Works consistently across `bash`, `zsh`, and automation environments
- Keeps temporary files under `.ai-ignored/`, which is git-ignored

## Architecture and System Map

`currencyinfo` is structured as a modular NestJS application:

```
src/
  main.ts                         # Application entrypoint and bootstrap
  app.module.ts                   # Root NestJS module (Mongoose, Config, Schedule, Global modules)
  http-exception.filter.ts        # Global HTTP exception filter for consistent error responses
  zod-validation.pipe.ts          # Request validation pipe using Zod schemas
  global/
    config/
      configuration.ts            # Configuration loader merging default and user config
      schema.ts                   # Strict Zod schema for config validation
    logger/
      logger.service.ts           # Custom Winston-based logger
      logger.constants.ts         # Log levels and formats
      logger.module.ts            # Logger dependency injection module
    notifier/
      notifier.service.ts         # Multi-channel notification service (Slack, Discord, ADAMANT)
      notifier.module.ts          # Notifier module
      adamant/
        api.ts                    # ADAMANT messenger integration via adamant-api
    version.ts                    # Version constant helper
  rates/
    rates.controller.ts           # REST endpoints: /get, /getHistory, /status
    rates.service.ts              # Periodic fetch scheduler, cache, MongoDB persistence, query handler
    rates.interceptor.ts          # Formats and wraps endpoint responses
    rates.module.ts               # Rates feature module
    merger/
      index.ts                    # RatesMerger core: price grouping, divergence check, merge logic
      strategy.ts                 # Strategies: avg, min, max, priority, weight
    sources/
      sources-manager.ts          # Data source manager, coin discovery, minSources check
      api/
        base.ts                   # Abstract base class for rate data providers
        coin-id-fetcher.ts        # Helper to discover remote coin IDs
        coingecko.ts              # CoinGecko connector
        coinmarketcap.ts          # CoinMarketCap connector
        cryptocompare.ts          # CryptoCompare connector
        currencyapi.ts            # CurrencyAPI connector (fiat rates)
        exchangeratehost.ts       # ExchangeRate.host connector
        moex.ts                   # Moscow Exchange (MOEX) connector
        dto/
          tickers.dto.ts          # SourceTickers, Tickers, and Price types
    schemas/
      getRates.schema.ts          # Zod validation schema for /get endpoint
      getHistory.schema.ts        # Zod validation schema for /getHistory endpoint
      ticker.schema.ts            # Mongoose schema for historical ticker records
      timestamp.schema.ts         # Mongoose schema for update timestamps
  shared/
    schema-types.ts               # Reusable Zod types (coinName, positiveNumber, etc.)
    utils.ts                      # Utilities (percentage difference calculations, rounding)
scripts/
  migrate.mjs                     # Config migration script from legacy v1 format
  migrate-db.mjs                  # MongoDB database migration script
```

## Rates Aggregation and Business Logic Invariants

When modifying rate calculation, merging, or source logic, preserve these rules:

- **Pair Normalization**: Pair strings are represented in `BASE/QUOTE` format (for example `ADM/USD`, `ADM/RUB`). Rates represent how many quote units equal 1 base unit.
- **Base Coin Triangulation**: All rates are calculated against configured `base_coins`. If a source returns pairs against USD, rates for other base coins are triangulated deterministically.
- **Divergence and Grouping**: Rates from multiple sources are grouped by `rateDifferencePercentThreshold`. If major groups deviate beyond `groupPercentage`, send alerts via `Notifier` and resolve using the configured strategy (`priority`, `avg`, `min`, `max`, `weight`).
- **Minimum Sources Gate**: The `minSources` threshold must be respected. If fewer sources are available than required, warn or drop unreliable pairs according to configuration.
- **Rate Lifetime**: Do not return stale rates older than `rateLifetime` (in minutes).
- **Graceful Degradation**: External API failures (rate limits, timeouts, schema changes) must never crash the service. Catch errors in individual source connectors, log them, and continue merging from healthy providers.

## Configuration Policy

- `config.default.jsonc` defines defaults and serves as the template
- `config.jsonc` is user-local configuration and must remain git-ignored
- The Zod configuration schema in `src/global/config/schema.ts` uses `.strict()` to reject unknown fields and catch legacy config mismatches early
- Always update both `config.default.jsonc` and `src/global/config/schema.ts` when adding or deprecating configuration properties

## JSDoc and Code Documentation Policy

- Write JSDoc comments for public services, controller methods, helper functions, and exported types
- Document purpose, `@param` descriptions (including value semantics and constraints), and `@returns` descriptions
- Focus code comments on non-obvious business logic, rate mathematics, and external API quirks
- Avoid redundant comments that merely restate standard language constructs

## Security and Secret Handling

- **Never log or expose secrets**: Slack webhook URLs, Discord webhook URLs, ADAMANT passphrases, and third-party API keys (CoinMarketCap, ExchangeRateHost, CryptoCompare) must never appear in logs, error payloads, or Git commits
- **Input Validation**: Validate all incoming query parameters and payloads using Zod pipes (`ZodValidationPipe`)
- **No Dynamic Execution**: Do not use `eval`, dynamic code construction, or unsanitized shell commands
- **Zero Telemetry**: Do not introduce analytics, metrics exporters to third parties, or tracking

## Dependency Management Policy

When installing or updating dependencies:

- Follow `.ai-tasks/update-deps-securely.md` principles
- Install with scripts disabled by default:

```bash
pnpm install --ignore-scripts
```

- Never use `--ignore-scripts=false` globally
- Review package names, maintainers, release dates, and lifecycle scripts before updating
- If a package requires native build steps (such as `@swc/core`), execute targeted rebuilds only for verified packages:

```bash
pnpm rebuild @swc/core --ignore-scripts=false
```

- Keep `pnpm-lock.yaml` committed and synchronized

## Testing and Quality Validation Policy

Before submitting changes, run and report the results of these verification steps:

### Baseline validation commands

```bash
# Run unit tests
pnpm test

# Run a specific test suite
pnpm test -- src/rates/merger/index.spec.ts

# Run linter checks
pnpm run lint

# Check and fix formatting
pnpm run format

# Compile and build the project
pnpm run build
```

### Reporting standards

In PRs and task summaries, always report:

- Exact commands executed
- Pass/fail status of tests, build, and linter
- Any intentionally skipped checks with explicit rationale

## AI Change Workflow

Follow this sequence for every task:

1. **Understand**: Read all relevant modules, schemas, and configurations before modifying code
2. **Identify Invariants**: Determine rate calculation contracts, API compatibility, and configuration schemas that must remain stable
3. **Minimal Safe Change**: Implement focused, minimal changes without broad unrelated refactoring
4. **Test**: Add or update unit tests in `*.spec.ts` matching the modified behavior
5. **Validate**: Run lint, format, build, and test suites
6. **Report**: Summarize changes, testing results, and any residual risks

## Pull Request Checklist for AI Agents

Before finalizing a PR, verify all:

- [ ] English-only repository output (code, comments, commits, PR text)
- [ ] List punctuation adheres to writing style (no period for 1 sentence, period for 2+ sentences)
- [ ] Markdown formatting complies with `.markdownlint.jsonc` and MD032
- [ ] No secrets, webhooks, or passphrases committed or logged
- [ ] Strict config validation in `schema.ts` matches `config.default.jsonc`
- [ ] Unit tests added or updated where appropriate
- [ ] `pnpm test`, `pnpm run lint`, and `pnpm run build` pass cleanly
- [ ] PR targets the `develop` branch and references the corresponding issue (`Closes #...`)

## Definition of Done

A change is considered done only when:

- Rate calculation accuracy and merging integrity are preserved
- Security and secret-handling rules are fully maintained
- All validation commands (`pnpm test`, `pnpm run lint`, `pnpm run build`) pass
- PR is submitted to `develop` following the naming, structure, and linking conventions
- All repository artifacts are strictly in English

## Related Repositories

| Repository | Description |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`adamant`](https://github.com/Adamant-im/adamant)                           | ADAMANT blockchain node core repository; reference for node guidelines and consensus rules                                                                               |
| [`adamant-im`](https://github.com/Adamant-im/adamant-im)                     | ADAMANT Messenger PWA, desktop, and mobile clients consuming `currencyinfo` rates                                                                                       |
| [`adamant-console`](https://github.com/Adamant-im/adamant-console)           | Node.js CLI and JSON-RPC tool interacting with ADAMANT nodes                                                                                                              |
| [`adamant-api-jsclient`](https://github.com/Adamant-im/adamant-api-jsclient) | `adamant-api` npm library used for ADAMANT blockchain notifications in `src/global/notifier/adamant/`                                                                    |
| [`adamant-wallets`](https://github.com/Adamant-im/adamant-wallets)           | Authoritative specification for coin IDs, token mappings, and node endpoints across ADAMANT apps (`assets/general/adamant/info.json`)                                   |
| [ADAMANT Documentation](https://docs.adamant.im)                             | Official architecture, API specifications, and developer guides                                                                                                           |
