# Upgrade and rollback

Currencyinfo keeps its REST responses, its configuration schema, and its stored documents backward compatible within a major version. An upgrade is a container tag change or a `git pull` plus a rebuild, and a rollback is the same operation in reverse.

Two upgrades need explicit steps: the index rebuild introduced in 4.2.0, and the document layout change introduced in 4.1.0.

## Before any upgrade

1. Read the [release notes](https://github.com/Adamant-im/currencyinfo/releases) for every version between yours and the target
2. Back up the database, see [backup](#backup)
3. Back up `config.jsonc`, which holds every provider key and the ADAMANT notification passphrase
4. Note the version you are on. `/status` reports it, and it is the tag you roll back to

```bash
curl -s http://localhost:36661/status | grep -o '"version":"[^"]*"'
```

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
