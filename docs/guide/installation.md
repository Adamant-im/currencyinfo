# Installation

Three supported ways to run Currencyinfo, in order of preference:

- [the published container image](#published-container-image), which is the recommended deployment
- [a container built from a checkout](#building-the-image-yourself), for contributors and for platforms without a published architecture
- [a source installation](#source-installation), for development and for hosts where Docker is unavailable

Whichever you choose, the configuration file and the MongoDB requirements are identical.

## Requirements

| Component | Version | Notes |
| --- | --- | --- |
| Node.js | 22 or newer | Only for a source installation |
| pnpm | 10.11.0 | Pinned through `packageManager`; npm works but the lockfile is pnpm's |
| MongoDB | 6.0 or newer | 8.0 is what the shipped Compose file pins |
| Docker | 24 or newer | Only for container deployments |

## Published container image

The image is published to the GitHub Container Registry on every stable release and is anonymously pullable:

```bash
docker pull ghcr.io/adamant-im/currencyinfo:latest
```

| Property | Value |
| --- | --- |
| Registry | `ghcr.io/adamant-im/currencyinfo` |
| Platforms | `linux/amd64`, `linux/arm64` |
| Base | `node:22-alpine` |
| Runtime user | `node`, UID and GID `1000` |
| Working directory | `/usr/src/currencyinfo` |
| Exposed port | `36661` |
| Entrypoint | `node dist/main` |

### Tags

| Tag | Moves | Use it for |
| --- | --- | --- |
| `4.2.0` | Never | Production. Pin this |
| `4.2` | Within a minor series | Automatic patch updates |
| `4` | Within a major series | Automatic minor updates |
| `latest` | Newest stable release | Evaluation and development |

`latest` is published only from a reviewed release whose tag is an ancestor of `master`. Pre-releases never move `latest`, and no image is ever published from `develop` or from an arbitrary workflow run.

### What is not in the image

The image contains the compiled application, the production dependency tree, and `config.default.jsonc` as a template. It contains no configuration, no credentials, no logs, and no database state. Mount your `config.jsonc` at runtime:

```bash
docker run -d \
  --name currencyinfo \
  --restart always \
  -p 36661:36661 \
  -v "$(pwd)/config.jsonc:/usr/src/currencyinfo/config.jsonc:ro" \
  ghcr.io/adamant-im/currencyinfo:4.2.0
```

Because the process runs as UID `1000` and Docker cannot change the ownership of a bind mount, run this once on Linux before the first start:

```bash
sudo chown 1000:1000 config.jsonc
sudo chmod 600 config.jsonc
```

### Verifying the image

Every published image carries OCI metadata, a build provenance attestation, and an SBOM:

```bash
# Labels and platforms
docker buildx imagetools inspect ghcr.io/adamant-im/currencyinfo:4.2.0

# Build provenance and SBOM attestations
docker buildx imagetools inspect ghcr.io/adamant-im/currencyinfo:4.2.0 \
  --format '{{ json .Provenance }}'
docker buildx imagetools inspect ghcr.io/adamant-im/currencyinfo:4.2.0 \
  --format '{{ json .SBOM }}'
```

The labels record the source repository, the exact revision, the version, the license, and this documentation site.

### Docker Compose

The repository ships [`docker-compose.prod.yaml`](https://github.com/Adamant-im/currencyinfo/blob/master/docker-compose.prod.yaml), which pulls the published image and pins MongoDB to a supported major version:

```bash
curl -fsSL -o docker-compose.yaml \
  https://raw.githubusercontent.com/Adamant-im/currencyinfo/master/docker-compose.prod.yaml
curl -fsSL -o config.jsonc \
  https://raw.githubusercontent.com/Adamant-im/currencyinfo/master/config.default.jsonc
sudo chown 1000:1000 config.jsonc && sudo chmod 600 config.jsonc
docker compose up -d
```

Local overrides belong in `docker-compose.override.yml`, which Compose merges automatically and which the repository git-ignores:

```yaml
services:
  app:
    ports: !override
      - '127.0.0.1:36661:36661'
    restart: unless-stopped
```

::: warning `ports` merges by appending, not by replacing
Without the `!override` tag Compose keeps **both** mappings, so the public `36661:36661` binding from the shipped file survives and the service stays exposed on every interface. Two publishers on the same host port can also fail to start. Check the merged result before relying on it:

```bash
docker compose -f docker-compose.yaml -f docker-compose.override.yml config
```

`!override` needs Compose v2.24 or newer. On an older Compose, edit the `ports` list in the main file instead of layering an override.
:::

## Building the image yourself

Contributors, and anyone on a platform outside the published manifest, can build from a checkout. `docker-compose.prod.yaml` carries a commented `build` block for exactly this:

```yaml
services:
  app:
    # Comment out `image:` and uncomment this to build from the checkout
    build:
      context: .
```

Or directly:

```bash
git clone https://github.com/Adamant-im/currencyinfo.git
cd currencyinfo
docker build -t currencyinfo:local .
```

The Dockerfile is a two-stage build. The builder installs the full dependency tree with lifecycle scripts disabled, rebuilds only `@swc/core`, and compiles the project. The runtime stage installs production dependencies only and copies the compiled output.

## Source installation

### 1. Clone and install

```bash
git clone https://github.com/Adamant-im/currencyinfo.git
cd currencyinfo
pnpm install --ignore-scripts
pnpm run deps:setup
```

`--ignore-scripts` blocks lifecycle scripts across the whole dependency tree. `deps:setup` then rebuilds `@swc/core` alone, which is the one package that genuinely needs a native build step.

### 2. Configure

```bash
cp config.default.jsonc config.jsonc
```

A source installation usually talks to a local MongoDB, so change the host:

```jsonc
{
  "server": {
    "mongodb": { "host": "127.0.0.1", "port": 27017, "db": "tickersdb" }
  }
}
```

`config.jsonc` is git-ignored. Keep it at mode `600`; it holds every provider key and the ADAMANT notification passphrase.

A local MongoDB for development is available through the repository's own Compose file:

```bash
docker compose up -d
```

### 3. Build and run

```bash
pnpm run build
pnpm run start:prod
```

For development with file watching, which also allows `config.test.jsonc` and falls back to `config.default.jsonc`:

```bash
pnpm run start:dev
```

### 4. Run it as a service

A minimal systemd unit for a source installation at `/opt/currencyinfo`:

```ini
[Unit]
Description=Currencyinfo exchange rates service
After=network-online.target mongod.service
Wants=network-online.target

[Service]
Type=simple
User=currencyinfo
Group=currencyinfo
WorkingDirectory=/opt/currencyinfo
ExecStart=/usr/bin/node dist/main
Restart=always
RestartSec=10

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/currencyinfo/logs

[Install]
WantedBy=multi-user.target
```

The working directory matters: the configuration file, the `logs/` directory, and the `package.json` the version is read from are all resolved relative to it.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now currencyinfo
```

## Migrating from Currencyinfo v1

A v1 `config.json` can be converted in place:

```bash
pnpm run migrate ./config.json
```

The script writes `config.jsonc` next to the source file and never overwrites an existing one. It also refuses to leave a source enabled that cannot work:

- CryptoCompare stays enabled only when the legacy `ccApiKey` is present, and the script reminds you to add `CryptoCompare` back to `priorities`
- CoinMarketCap stays enabled only when the legacy `cmcApiKey` is present
- CoinGecko is always disabled, because a v1 configuration carries no Demo key

Read every warning it prints: each one names a follow-up step.

## Migrating a pre-4.1 database

Releases before 4.1.0 used a different ticker document layout. The change is not breaking for API consumers — endpoint responses and `_id` values are unchanged — but the stored documents must be converted:

```bash
pnpm exec node scripts/migrate-db.mjs
```

Run it interactively so the connection string is prompted for and masked, rather than passed on a command line where it lands in shell history and in the process list. See [upgrade and rollback](./upgrading.md) for the full procedure.

## Next steps

- [Configuration reference](../reference/configuration.md)
- [Operations](./operations.md) for reverse proxy, TLS, and health checks
- [Upgrade and rollback](./upgrading.md)
