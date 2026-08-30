# Security and Bug Review

## Executive Summary

The review covered the `currencyinfo` service at commit `42940670c37e0a3df26835926a7899e1783948f6` on 2026-08-30 with Node.js 24.19.0 and pnpm 10.11.0. No critical vulnerabilities were found. The working-tree changes remediate two high-severity rate and history correctness defects, five medium-severity security or reliability defects, and three low-severity hardening or compatibility defects.

The review used source inspection, focused regression tests, the complete Jest suite, linting, formatting validation, a production dependency audit, a production build, configuration validation, and HTTP checks against the compiled application with a local MongoDB instance. No credentials or production configuration values were printed during validation.

## High Severity

### CUR-BUG-001: Historical pair filters reversed BASE and QUOTE

Rule ID: CUR-BUG-001

Severity: High

Location: `src/rates/rates.service.ts:287`, `src/rates/rates.service.ts:299`

Evidence: The previous implementation destructured a documented `BASE/QUOTE` value as `const [quoteCoin, baseCoin] = coin.split('/')` and queried the opposite MongoDB fields. A request for `ADM/USD` therefore selected `USD/ADM` data.

Impact: Consumers could receive the wrong historical market or an empty result, which can lead to incorrect valuations and inverse-rate decisions.

Fix: Preserve BASE/QUOTE order for complete and partial pair filters and cover `ADM/USD` and `ADM/` with regression tests.

Mitigation: Clients should continue treating the pair key as authoritative and should validate expected base and quote symbols in downstream calculations.

False positive notes: The repository documentation and ticker persistence schema both define pair order as BASE/QUOTE, so the reversed query was not an alternate convention.

### CUR-RATE-001: Untrusted provider values entered aggregation without runtime validation

Rule ID: CUR-RATE-001

Severity: High

Location: `src/rates/rates.service.ts:356`, `src/rates/rates.service.ts:426`

Evidence: Connector return types were compile-time only, and the previous service returned provider tickers directly. Negative, non-finite, non-numeric, empty, or malformed-pair responses could therefore be counted as successful and reach rate merging or persistence.

Impact: A malformed or compromised source could corrupt a single-source pair, break precision operations, or make the service persist an empty snapshot as ready.

Fix: Validate complete pair syntax and require finite positive numeric values at the common provider boundary, ignore invalid entries, reject responses with no valid entries, and prevent empty merged snapshots from being saved.

Mitigation: Provider-specific schema validation can be added later for richer diagnostics, while the shared boundary remains the final invariant gate.

False positive notes: TypeScript interfaces do not validate remote JSON at runtime, and several connectors intentionally consume third-party data with optional chaining rather than a runtime schema.

## Medium Severity

### SEC-CONFIG-001: Nested configuration and unsafe numeric values were accepted

Rule ID: EXPRESS-INPUT-001

Severity: Medium

Location: `src/global/config/schema.ts:52`, `src/global/config/schema.ts:247`

Evidence: Only the top-level configuration object was strict. Nested server, MongoDB, notifier, and source objects stripped unknown fields, while negative refresh intervals, invalid ports, unsafe decimal precision, non-positive weights, and enabled authenticated sources without keys could pass validation or fail open as disabled.

Impact: Typos and legacy options could be silently ignored, unsafe timers could create excessive work, invalid precision could break connector updates, and operators could believe a configured source was active when it was not.

Fix: Make every nested object strict, constrain numeric domains and URL protocols, validate enabled-source prerequisites, require positive source weights and IDs, and retain optional unauthenticated CryptoCompare operation.

Mitigation: Validate configuration during deployment before replacing a running instance.

False positive notes: Both `config.default.jsonc` and the local `config.jsonc` passed the strengthened schema during this review.

### SEC-LOG-001: Webhook credentials were outside the redaction contract

Rule ID: EXPRESS-ERROR-001

Severity: Medium

Location: `src/shared/utils.ts:142`, `src/shared/utils.ts:184`, `src/global/logger/logger.service.ts:86`, `src/global/notifier/notifier.service.ts:45`

Evidence: The sanitizer handled labelled keys and URI user information but returned complete Slack and Discord webhook URLs unchanged. Notifier error paths also interpolated arbitrary error strings into logs.

Impact: An exception containing a webhook URL could expose a reusable notification credential in console or persistent logs.

Fix: Redact Slack and Discord webhook paths, sanitize every custom logger message and notifier path, and create log files with mode `0600` inside a `0750` directory.

Mitigation: Rotate a webhook immediately if an older log is found to contain its complete URL.

False positive notes: Axios normally emits a short message, but custom adapters and nested error causes can include request configuration, so centralized redaction is required.

### CUR-SOURCE-001: Aliases could count one provider more than once for minSources

Rule ID: CUR-SOURCE-001

Severity: Medium

Location: `src/rates/sources/sources-manager.ts:101`, `src/rates/sources/sources-manager.ts:130`

Evidence: The previous loop incremented coverage once for every enabled symbol before deduplicating mapped symbols and did not reset coverage on reinitialization. Two aliases from one source could therefore satisfy a two-source requirement.

Impact: A pair could pass the reliability gate without the configured number of independent providers.

Fix: Reset coverage before discovery and deduplicate mapped symbols separately for each provider.

Mitigation: Avoid mapping multiple source symbols to one canonical symbol until the fixed counting logic is deployed.

False positive notes: The defect requires aliases or repeated initialization, but both are supported internal operations.

### CUR-SCHED-001: Scheduled updates could overlap

Rule ID: CUR-SCHED-001

Severity: Medium

Location: `src/rates/rates.service.ts:85`, `src/rates/rates.service.ts:165`

Evidence: `setInterval` invoked the asynchronous update method without checking whether the prior run had finished. A slow provider or database could therefore leave multiple refresh cycles active.

Impact: Overlapping cycles could race on shared caches, duplicate external requests, increase rate-limit pressure, and interleave MongoDB snapshots.

Fix: Add a synchronous in-progress guard, skip overlapping runs with an operational warning, catch unexpected cycle failures, and reset the guard in `finally`.

Mitigation: Keep provider and database timeouts below the configured refresh interval where practical.

False positive notes: Existing HTTP timeouts reduce likelihood but do not cover initialization stalls or aggregate multi-source latency.

### CUR-HISTORY-002: Historical boundary cases were ignored and cursors were left open

Rule ID: CUR-HISTORY-002

Severity: Medium

Location: `src/rates/rates.service.ts:245`, `src/rates/rates.service.ts:330`, `src/rates/schemas/getHistory.schema.ts:4`, `src/rates/schemas/getHistory.schema.ts:24`

Evidence: `timestamp=0` was skipped by a truthiness check, one-sided `from` or `to` filters were ignored, fractional values were accepted, sorting used insertion identity instead of the stored rate timestamp, and limit completion did not explicitly close the aggregation cursor.

Impact: Valid boundary requests could return unrelated history, backfilled records could be ordered incorrectly, and repeated limited queries could retain server-side cursor resources longer than necessary.

Fix: Use explicit undefined checks, support one-sided ranges, require bounded integer timestamps and limits, sort by `date`, and close the cursor in `finally`.

Mitigation: Keep the API limit at or below 100 and monitor slow MongoDB queries.

False positive notes: MongoDB may eventually clean abandoned cursors, but explicit closure is deterministic and avoids depending on timeout behavior.

## Low Severity

### SEC-DEPLOY-001: Default runtime and development network exposure needed hardening

Rule ID: EXPRESS-FINGERPRINT-001

Severity: Low

Location: `src/main.ts:25`, `src/main.ts:27`, `Dockerfile:28`, `Dockerfile:30`, `docker-compose.yaml:5`, `docker-compose.yaml:6`

Evidence: Express exposed its `X-Powered-By` header, the runtime container used the root user, and the development MongoDB port was published on every host interface without database authentication.

Impact: These defaults increased framework fingerprinting, container privilege, and accidental LAN exposure of a development database.

Fix: Disable `X-Powered-By`, run the production image as the existing `node` user with a writable owned log directory, and bind the development MongoDB port to loopback only.

Mitigation: Continue using an authenticated reverse proxy and do not expose the development Compose stack on an untrusted host.

False positive notes: An external firewall may already limit the development port, but the repository configuration did not express that boundary.

### CUR-API-001: Unknown and ambiguous query values were not rejected

Rule ID: EXPRESS-INPUT-002

Severity: Low

Location: `src/rates/schemas/getRates.schema.ts:7`, `src/rates/schemas/getRates.schema.ts:12`, `src/rates/schemas/getHistory.schema.ts:12`, `src/rates/schemas/getHistory.schema.ts:24`, `src/shared/schema-types.ts:6`, `src/shared/schema-types.ts:64`

Evidence: Query schemas stripped unknown fields, the partial pair grammar accepted `/`, and historical numeric inputs allowed fractions.

Impact: Client mistakes were hidden, ambiguous pair filters could expand to all records, and unexpected numeric coercion weakened the request contract.

Fix: Use strict query objects, reject an empty partial pair, and require integer historical parameters.

Mitigation: Clients should send each documented scalar query parameter once.

False positive notes: Nest and Zod already rejected array values for scalar fields, so HTTP parameter pollution was partially constrained before this change.

### CUR-COMPAT-001: CryptoCompare contradicted its optional-key configuration contract

Rule ID: CUR-COMPAT-001

Severity: Low

Location: `src/rates/sources/api/cryptocompare.ts:27`, `src/rates/sources/api/cryptocompare.ts:31`

Evidence: The documentation marked the CryptoCompare key optional, but connector enablement required a truthy key.

Impact: A valid keyless configuration silently disabled a configured provider and reduced source diversity.

Fix: Enable CryptoCompare when coins are configured even without a key; Axios omits the undefined optional parameter value.

Mitigation: Configure an API key when higher provider limits are required.

False positive notes: The public endpoint supports keyless access, while rate limits remain provider-controlled.

## Reviewed Areas With No Findings

- No authentication, cookies, sessions, or state-changing routes are present, so session and CSRF controls are not applicable
- CORS is not enabled by application code
- No dynamic execution, shell invocation, redirects, templates, file upload, or file-serving routes are present
- MongoDB filters are constructed from validated scalar fields rather than request-supplied query objects
- No request parameter controls an outbound URL; configurable provider URLs are operator-controlled and now restricted to HTTP or HTTPS
- External Axios calls already use explicit timeouts
- `pnpm audit --prod` reported no known production dependency vulnerabilities
- No repository-tracked live secret was identified by the focused secret scan
- Semgrep reported one local CLI path-resolution candidate in `scripts/migrate.mjs`; it is not an attacker-controlled web path because selecting arbitrary config files is the explicit operator-only purpose of the migration command

## Residual Risks and Coverage Gaps

- Application-level rate limiting and the broader HTTP header policy are not defined in this service; verify equivalent controls at the reverse proxy
- Configurable HTTP provider URLs intentionally permit private self-hosted sources, so infrastructure egress policy remains the appropriate SSRF boundary
- The mutable `mongo:latest` Compose tag is operationally convenient but not reproducible; pinning policy should be decided together with the supported MongoDB upgrade policy
- Docker configuration was inspected statically, but the image could not be built because the Docker daemon was unavailable
- Live checks used a local MongoDB instance with an isolated empty database and disabled external providers; authenticated provider behavior was covered by mocks rather than live credentials

## Verification

The final validation commands and results are recorded in the task handoff. No linked GitHub issues were created during local branch work because all confirmed findings in this report were remediated in the working tree and no sensitive vulnerability details required publication.
