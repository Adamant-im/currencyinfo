# Installation — moved

> [!IMPORTANT]
> This page is **deprecated** and no longer updated. The maintained installation guide is at **<https://currencyinfo.docs.adamant.im/guide/installation>**.

- **[Quick start with Docker](https://currencyinfo.docs.adamant.im/guide/quick-start)** — the fastest working instance, using the published image
- **[Installation](https://currencyinfo.docs.adamant.im/guide/installation)** — the published container image, building from a checkout, a source installation, and a systemd unit
- **[Upgrade and rollback](https://currencyinfo.docs.adamant.im/guide/upgrading)** — backups, version upgrades, index rebuilds, and database migrations

## What changed since this page was written

- Currencyinfo requires **Node.js 22 or newer**. This page said v20
- A **published container image** exists at `ghcr.io/adamant-im/currencyinfo`, covering `linux/amd64` and `linux/arm64`. Building the image locally is no longer the recommended path
- The contributing guide is [`CONTRIBUTING.md`](https://github.com/Adamant-im/currencyinfo/blob/master/CONTRIBUTING.md) at the repository root, not `.github/CONTRIBUTING.md`
- The container runs as the unprivileged `node` user with UID and GID `1000`, so a bind-mounted `config.jsonc` needs `sudo chown 1000:1000 config.jsonc` on Linux before the first start
