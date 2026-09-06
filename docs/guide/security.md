# Security

Currencyinfo handles third-party API keys, notification webhooks, and an optional blockchain passphrase. This page covers what the service protects, what it does not, and what an operator has to do.

## Threat model in one paragraph

Currencyinfo is an internal service that reads from public rate APIs and writes to your own database. It has no user accounts, no write API, and no authentication. The assets worth protecting are the credentials in the configuration file and the integrity of the rates it serves. The realistic threats are credential leakage through logs or a shared repository, a hostile or compromised upstream provider returning bad prices, and an unprotected HTTP endpoint being exposed to the internet.

## Credentials

Everything sensitive lives in one file:

| Field | Sensitivity |
| --- | --- |
| `coingecko.api_key`, `coinmarketcap.api_key`, `exchange_rate_host.api_key`, `cryptocompare.api_key` | Provider quotas and billing |
| `notify.slack`, `notify.discord` | Anyone with the URL can post to your channel |
| `notify.adamantPassphrase` | Full control of the sending ADAMANT account and its funds |

Operator responsibilities:

- keep `config.jsonc` at mode `600`, owned by the runtime user. `config.jsonc` and `config.test.jsonc` are git-ignored, and they must stay that way
- use a **dedicated** ADAMANT account for notifications, funded with a small balance. The passphrase sits in a file on a server
- never paste a real webhook URL, key, or passphrase into an issue, a pull request, or a support channel. Use the synthetic placeholders from [notifications](./notifications.md)
- rotate a credential that has ever been committed, even to a private repository, and even after a force-push

### Placeholder detection

The shipped template carries readable placeholders such as `"API key for CoinMarketCap"` and `"apple banana..."` so it is obvious where each credential goes. They are recognised as placeholders and treated as **no credential at all**, including the spellings used by earlier templates and by Currencyinfo v1.

Enabling a source while its placeholder is still in place therefore fails at startup with a message naming that source, instead of shipping a live deployment that answers `401` on every request.

### Redaction

Every log line and every notification passes through a redactor before it is written. It strips API keys, bearer tokens, URI credentials, and sensitive query parameters and JSON fields — including from Axios error URLs and request parameters, which is the path that most often leaks a key in a stack trace.

Redaction is a safety net, not a licence. Do not add code that formats a secret into a message.

## Configuration validation

The configuration is parsed and validated before a port is opened. Any failure prints a formatted report and exits non-zero.

- the schema is **strict**: an unknown key is an error, not something ignored. A typo cannot silently disable a source, and a stale key from an old release cannot linger unnoticed
- webhook URLs must match the documented Slack and Discord formats
- ADAMANT addresses must be `U` followed by 6 to 21 digits, and listing one without a passphrase fails
- an enabled source that cannot work — missing key, empty coin list, a quote asset with no market — fails at startup rather than on every request
- `binance.quote_asset` is restricted to USD-pegged assets, because the connector relabels the quote as USD without converting it

## Input validation

Every query parameter on `/get` and `/getHistory` is validated with Zod before it reaches the service:

- unknown query parameters are rejected
- coin symbols and pairs must match the documented character set
- timestamps must be non-negative integers within a safe range, and `from > to` is rejected
- `limit` is a positive integer, capped at 100

Nothing from a request reaches MongoDB as a raw expression. Coin filters are turned into fixed-shape match documents, so a query parameter cannot inject an operator.

Unhandled exceptions return a generic `Something went wrong` with a `500`, and the real message goes to the log, redacted. Internal details are never returned to a client.

## Trusting upstream data

Every provider response is treated as untrusted:

- malformed pair names, non-numeric prices, and non-positive or non-finite values are dropped, and the count is logged
- a source returning nothing usable is recorded as unavailable rather than merged as an empty set
- triangulated cross-rates are re-checked, because rounding can collapse a small rate to zero
- a single provider cannot move a rate on its own once `minSources` and the grouping rules are in play — see [rate calculation](./rate-calculation.md)

The strongest protection against a wrong price is a source mix where no provider is load-bearing. Keep at least two independent sources for every pair you care about, and prefer sources that do not share an upstream. Binance is in the default set precisely because it is an exchange rather than an aggregator.

CoinLore's numeric coin IDs are reassigned across listings, so a stale ID is rejected at runtime when the returned symbol does not match, rather than silently quoting a different asset. CoinPaprika symbols are ambiguous — `ADM` matches two active coins — so symbols are resolved by rank among active candidates and every returned ticker symbol is verified before its price is used.

## Network exposure

- the HTTP server has no TLS, no authentication, and no rate limiting. Do not expose it directly to the internet
- bind to loopback or to a private network, and put a reverse proxy in front of it — see [operations](./operations.md#reverse-proxy-and-tls)
- MongoDB must not be publicly reachable. The shipped Compose file keeps it on an internal network with no published port
- outbound traffic goes only to the providers you enable and the notification channels you configure. There is no telemetry, no analytics, and no update check. The full host list is in [operations](./operations.md#outbound-network)

## Container hardening

The published image already:

- runs as the unprivileged `node` user, UID and GID `1000`, never as root
- contains no configuration, no credentials, no logs, and no database state
- contains production dependencies only, installed with lifecycle scripts disabled
- ships **no package manager**. npm, pnpm and yarn are removed from the runtime layer, because the service runs `node dist/main` against an already-built dependency tree and a package manager in a production image is attack surface rather than a tool
- carries a build provenance attestation and an SBOM

Worth adding at the deployment level:

```yaml
services:
  app:
    read_only: true
    tmpfs:
      - /tmp
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    volumes:
      - ./config.jsonc:/usr/src/currencyinfo/config.jsonc:ro
      - logs:/usr/src/currencyinfo/logs
```

`read_only` needs a writable `logs` volume, since the service opens a log file on start.

## Dependencies

The repository's dependency policy is deliberately conservative:

- installs run with `--ignore-scripts`, so no package executes a lifecycle script during install
- exactly one package, `@swc/core`, is rebuilt afterwards through `pnpm run deps:setup`
- `pnpm-lock.yaml` is committed, and CI installs with `--frozen-lockfile`
- `pnpm.overrides` pins patched versions of transitive packages with known advisories, and is reviewed on every dependency update

Check the tree yourself before deploying an unreleased revision:

```bash
pnpm install --ignore-scripts --frozen-lockfile
pnpm audit
```

## Vulnerability scanning policy

Every image is scanned with [Trivy](https://trivy.dev) before it is published, and the same scan runs on every pull request that touches the image. A `critical` or `high` finding **that has a fix available** fails the build, so it cannot reach the registry. Findings with no upstream fix are printed in the workflow log rather than blocking, and belong in the release notes.

The gate lives in [`publish-docker.yml`](https://github.com/Adamant-im/currencyinfo/blob/master/.github/workflows/publish-docker.yml) and [`docker-ci.yml`](https://github.com/Adamant-im/currencyinfo/blob/master/.github/workflows/docker-ci.yml), and an operator can reproduce it on any tag:

```bash
# Trivy
trivy image ghcr.io/adamant-im/currencyinfo:4.2.0

# Grype against the published SBOM
docker buildx imagetools inspect ghcr.io/adamant-im/currencyinfo:4.2.0 \
  --format '{{ json .SBOM }}' > sbom.json
grype sbom:sbom.json
```

The project's commitments:

- the base image is `node:22-alpine`, and every build runs `apk upgrade`, so an Alpine security fix reaches users on the next release rather than waiting for the base image itself to be rebuilt
- a `critical` or `high` finding with a fix available blocks publication, and is addressed in a patch release
- a finding with no upstream fix is documented in the release notes rather than silently carried
- the SBOM published with each image is the authoritative component list for your own scanner

## Reporting a vulnerability

Report security issues privately rather than in a public issue. Email the maintainers at `devs@adamant.im`.

Include the affected version, a reproduction, and the impact you observed. Please allow time for a fix before public disclosure.
