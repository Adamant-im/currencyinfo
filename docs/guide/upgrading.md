# Upgrade and rollback

Currencyinfo keeps its REST responses and its stored documents backward compatible within a major version, so most upgrades are a container tag change or a `git pull` plus a rebuild, and a rollback is the same operation in reverse.

Three upgrades need explicit steps, and the first of them is not optional:

- **4.1.2 to 4.2.0 needs a configuration migration.** A stock 4.1.2 `config.jsonc` does not start on 4.2.0. See [configuration migration](#412-to-420-configuration-migration) and do it before you change the tag
- 4.1.2 to 4.2.0 also rebuilds the `tickers` indexes, see [index rebuild](#412-to-420-index-rebuild)
- 4.0.x to 4.1.0 changes the stored document layout, see [document migration](#40x-to-410-document-migration)

## Before any upgrade

1. Read the [release notes](https://github.com/Adamant-im/currencyinfo/releases) for every version between yours and the target
2. Back up the database, see [backup](#backup)
3. Back up `config.jsonc`, which holds every provider key and the ADAMANT notification passphrase
4. Note the version you are on. `/status` reports it, and it is the tag you roll back to

```bash
curl -s http://localhost:36661/status | grep -o '"version":"[^"]*"'
```

5. Migrate the configuration if you are coming from 4.1.2 or older, and validate it before restarting anything

## Backup

`tickers` and `timestamps` are one logical unit. A snapshot is complete only when both collections contain it, so dump them together:

```bash
mongodump --uri="mongodb://127.0.0.1:27017/tickersdb" --out=./backup-$(date +%F)
```

Restore into an empty database:

```bash
mongorestore --uri="mongodb://127.0.0.1:27017" ./backup-2026-09-04
```

With the shipped Compose file the database lives in the `mongo_data` named volume, so dumping from inside the container writes to a path you also need to copy out:

```bash
docker compose exec -T mongodb \
  mongodump --archive --db=tickersdb > tickersdb-$(date +%F).archive

docker compose exec -T mongodb \
  mongorestore --archive --drop < tickersdb-2026-09-04.archive
```

History is append-only, so a backup is never invalidated by a later upgrade. It only loses the snapshots recorded after it was taken.

## Upgrading a container deployment

::: warning Coming from 4.1.2 or older
Migrate `config.jsonc` first, or the new container exits during validation instead of starting. See [configuration migration](#412-to-420-configuration-migration).
:::

```bash
# Pin the target version rather than pulling `latest` into production
docker compose pull
docker compose up -d
docker compose logs -f app
```

Watch for the configuration report and the first `Rates from N/M sources saved successfully.` line. Then confirm readiness:

```bash
curl -s http://localhost:36661/status
```

If you pin exact versions, edit the tag in the Compose file first:

```yaml
services:
  app:
    image: ghcr.io/adamant-im/currencyinfo:4.2.0
```

## Upgrading a source installation

The same configuration migration applies: see [configuration migration](#412-to-420-configuration-migration) when coming from 4.1.2 or older.

```bash
cd /opt/currencyinfo
git fetch --tags
git checkout v4.2.0
pnpm install --ignore-scripts --frozen-lockfile
pnpm run deps:setup
pnpm run build
sudo systemctl restart currencyinfo
```

`--frozen-lockfile` fails rather than silently resolving a different dependency tree than the release was tested with.

## Rollback

A rollback is safe as long as the target version can read the stored documents, which is true for every 4.x release from 4.1.0 onwards.

```bash
# Container
docker compose down
# edit the image tag back to the previous version
docker compose up -d

# Source
git checkout v4.1.2
pnpm install --ignore-scripts --frozen-lockfile
pnpm run deps:setup
pnpm run build
sudo systemctl restart currencyinfo
```

Rolling back below 4.1.0 requires restoring a backup taken before the 4.1.0 database migration, because the document layout changed.

Indexes created by a newer version are left in place by an older one. They cost write amplification and disk but are never read incorrectly, so a rollback does not require dropping them. Drop them only if you intend to stay on the older version.

## 4.1.2 to 4.2.0: configuration migration

::: danger A stock 4.1.2 configuration does not start on 4.2.0
Validation runs before the HTTP port opens and exits non-zero, so changing the tag and restarting takes the service down rather than degrading it. Migrate the file first.
:::

4.2.0 makes an API key mandatory for two sources that were previously usable without one, because both upstreams changed:

```text
App configuration is invalid:
  cryptocompare: api_key: Provide a CoinDesk Data (former CryptoCompare) API key when
    CryptoCompare is enabled. The free tier was retired on 21 May 2026
  coingecko: api_key: Provide a free CoinGecko Demo API key when CoinGecko is enabled.
    Get one at https://www.coingecko.com/en/developers/dashboard
Cannot start the app.
```

Both blocks are enabled in the 4.1.2 template, and an omitted `enabled` counts as enabled, so an untouched configuration hits both errors.

### 1. Resolve the two blocking sources

Pick per source. Disabling is the smallest change:

```jsonc
{
  "cryptocompare": { "enabled": false },
  "coingecko": { "enabled": false }
}
```

Or keep them by supplying credentials:

- **CoinGecko** needs a free Demo plan key, no credit card. Create one at the [developer dashboard](https://www.coingecko.com/en/developers/dashboard) and set `coingecko.api_key`. See [CoinGecko](../reference/sources/coingecko.md)
- **CryptoCompare** needs a paid CoinDesk Data subscription. Without one, leave it disabled. See [CryptoCompare](../reference/sources/cryptocompare.md)

The shipped placeholders are recognised as *no credential*, so pasting `"API key for CryptoCompare"` back in does not satisfy the check.

### 2. Restore coverage

On 4.1.2 those two were the only free crypto sources, so disabling both leaves no crypto coverage at all. Add the keyless sources 4.2.0 ships instead. Copy the blocks from [`config.default.jsonc`](https://github.com/Adamant-im/currencyinfo/blob/master/config.default.jsonc) and keep your own coin lists:

```jsonc
{
  "coinpaprika": { "enabled": true, "ids": ["btc-bitcoin", "eth-ethereum"], "bulk_limit": 200, "max_individual_requests": 5 },
  "coinlore": { "enabled": true, "ids": { "BTC": 90, "ETH": 80 } },
  "binance": { "enabled": true, "quote_asset": "USDT", "coins": ["BTC", "ETH"] },
  "exchange_rate_api": { "enabled": true, "url": "https://open.er-api.com/v6/latest/USD", "codes": ["USD", "EUR"] }
}
```

`coinpaprika`, `coinlore` and `binance` are optional blocks, but `exchange_rate_api` is validated as a whole: if you add it at all, `enabled` and `url` are both required. Per-source identifiers, quotas and terms are in the [source reference](../reference/sources/).

### 3. Update `priorities`

`priorities` is a plain list of names, so an entry for a disabled source is inert rather than an error, but a missing entry for a new source drops it below every listed one. Remove `CryptoCompare` and add whatever you enabled:

```jsonc
{
  "priorities": [
    "ExchangeRateHost",
    "Coinmarketcap",
    "Coingecko",
    "CoinPaprika",
    "CoinLore",
    "Binance",
    "ExchangeRateApi",
    "CurrencyApi",
    "MOEX"
  ]
}
```

### 4. Keep everything else

Nothing else changed shape. Your `server`, `notify`, `base_coins`, `mappings`, `strategy`, `rateDifferencePercentThreshold`, `groupPercentage`, `minSources`, `rateLifetime` and `refreshInterval` values carry over untouched, as do the coin lists of any source you keep.

The schema is strict, so a key that no longer exists is an error rather than something ignored. Merge the new blocks into your file instead of replacing it with the template, or you lose your own settings.

### 5. Validate before restarting

Config validation happens before anything else, so a throwaway container tells you the verdict without touching your deployment or your database:

```bash
docker run --rm \
  -v "$(pwd)/config.jsonc:/usr/src/currencyinfo/config.jsonc:ro" \
  ghcr.io/adamant-im/currencyinfo:4.2.0
```

A rejected configuration prints the report above and exits non-zero. An accepted one prints `InfoService successfully read the configuration file` and then fails on the database it cannot reach, which is the expected outcome for this check — stop it with Ctrl-C.

For a source installation, the same check is `pnpm run build && pnpm run start:prod` against the migrated file.

### After the upgrade

Watch the first cycle. `minSources` is measured against the sources that are actually enabled, so a thinner source mix shows up as a startup warning naming every pair below the threshold, and as `expected N, but got M` alerts. If you see those, add coverage rather than lowering `minSources`.

## 4.1.2 to 4.2.0: index rebuild

Every `tickers` index is now date-ordered, so `/getHistory` sorts are served by an index instead of a blocking in-memory sort. Three indexes replace three older ones:

| Created on first start of 4.2.0 | Superseded, not dropped automatically |
| --- | --- |
| `{ base: 1, date: -1 }` | `{ base: 1 }` |
| `{ quote: 1, date: -1 }` | `{ quote: 1 }` |
| `{ base: 1, quote: 1, date: -1 }` | `{ base: 1, quote: 1 }` |

`{ date: 1 }` is unchanged.

Mongoose `autoIndex` creates missing indexes on connect but never drops undeclared ones, so a direct upgrade builds all three new indexes at startup and keeps all three old ones. On a large history collection that is real I/O, and it can delay readiness.

Build the new indexes out of band before deploying:

```js
db.tickers.createIndex({ base: 1, date: -1 }, { background: true });
db.tickers.createIndex({ quote: 1, date: -1 }, { background: true });
db.tickers.createIndex({ base: 1, quote: 1, date: -1 }, { background: true });
```

Once 4.2.0 is running and validated, drop the superseded ones to stop paying for their write amplification and disk:

```js
db.tickers.dropIndex('base_1');
db.tickers.dropIndex('quote_1');
db.tickers.dropIndex('base_1_quote_1');
```

Keep the old indexes until you are past the point of rolling back.

## 4.0.x to 4.1.0: document migration

4.1.0 changed the internal ticker document layout. Endpoint responses and `_id` values are unchanged, so API consumers see nothing, but the stored documents must be converted:

```bash
pnpm exec node scripts/migrate-db.mjs
```

Run it interactively. The script prompts for the connection string with the input masked, which keeps database credentials out of shell history and out of the process list. If you must supply it non-interactively, load it from a protected file rather than typing it inline:

```bash
MIGRATE_DB_URL="$(< /run/secrets/mongo_uri)" pnpm exec node scripts/migrate-db.mjs
```

Take a backup first. The migration rewrites documents in place.

## v3 to v4

There is no in-place upgrade path. Install v4 from scratch, then convert the old configuration:

```bash
pnpm run migrate ./config.json
```

The script writes a `config.jsonc` with the migrated properties and prints a warning for every setting that needs attention. See [installation](./installation.md#migrating-from-currencyinfo-v1) for what it changes.

## After every upgrade

- `/status` reports `ready: true` and a `version` matching the target
- `/get` returns the pairs your clients expect
- The logs contain no repeated source failures and no configuration warnings
- The startup coverage warning lists no pair you rely on
