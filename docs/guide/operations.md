# Operations

Running Currencyinfo in production: process supervision, reverse proxy and TLS, logging, health checks, and resource expectations.

## The service is not internet-facing by itself

The HTTP server has no TLS, no authentication, and no rate limiting. It is designed to sit behind a reverse proxy, or to be reachable only from the applications that consume it.

Bind it to loopback when the consumer runs on the same host:

```yaml
services:
  app:
    ports: !override
      - '127.0.0.1:36661:36661'
```

The `!override` tag matters. Compose merges `ports` by appending, so without it the public `36661:36661` mapping from `docker-compose.prod.yaml` survives alongside the loopback one and the service stays reachable from every interface. Confirm with `docker compose config` before you rely on it. The tag needs Compose v2.24 or newer; on an older release, edit the `ports` list in the main file instead.

Or keep it on a private Compose network with no published port at all, and let the consuming container reach it by service name.

## Reverse proxy and TLS

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name rates.example.com;

    ssl_certificate     /etc/letsencrypt/live/rates.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/rates.example.com/privkey.pem;

    # Rates are cheap to serve but the upstream is a single process.
    limit_req zone=rates burst=20 nodelay;

    location / {
        proxy_pass http://127.0.0.1:36661;
        proxy_http_version 1.1;

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 5s;
        proxy_read_timeout    30s;
    }
}

# In the http block
limit_req_zone $binary_remote_addr zone=rates:10m rate=10r/s;
```

### Caddy

```text
rates.example.com {
    reverse_proxy 127.0.0.1:36661
}
```

Notes that apply to any proxy:

- the application does not read `X-Forwarded-*`. It logs nothing per request and makes no decision based on the client address, so those headers are for your proxy's own logs
- `x-powered-by` is disabled by the application
- responses are small JSON documents and compress well. Enable gzip or brotli at the proxy
- if you expose the service publicly, put rate limiting at the proxy. There is none in the application

## Caching

`/get` reads an in-memory table, so it is already cheap, but a public deployment benefits from a short proxy cache. The data only changes once per `refreshInterval`:

```nginx
proxy_cache_valid 200 30s;
```

Do not cache `/status`. Its whole purpose is to report the current moment.

## Health and readiness

`/status` is the health endpoint. It always returns `200` when the process is alive, so read the body:

```json
{
  "success": true,
  "date": 1720472096540,
  "ready": true,
  "updating": false,
  "next_update": 1720472646060,
  "last_updated": 1720472000000,
  "version": "4.2.0"
}
```

| Field | Meaning |
| --- | --- |
| `ready` | A snapshot has been stored at least once since startup. This is the readiness signal |
| `updating` | A refresh cycle is running right now |
| `next_update` | When the next refresh is scheduled, in milliseconds |
| `last_updated` | When the last snapshot was stored, or `null` before the first one |

::: warning `updating` is not an overdue indicator
After a failed cycle the service is idle and reports `updating: false` until the next scheduled attempt. To detect a stalled schedule, compare `next_update` against your own clock.
:::

### Liveness and readiness probes

```bash
# Liveness: the process answers
curl -fsS http://127.0.0.1:36661/status > /dev/null

# Readiness: rates are actually available
curl -fsS http://127.0.0.1:36661/status | grep -q '"ready":true'
```

A Compose healthcheck:

```yaml
services:
  app:
    healthcheck:
      test: ['CMD', 'node', '-e', "fetch('http://127.0.0.1:36661/status').then(r=>r.json()).then(s=>process.exit(s.ready?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 60s
```

`start_period` matters: coin discovery plus the first refresh takes tens of seconds on a cold start.

### Staleness alert

The single most useful external alert is "the data stopped moving". Compare `last_updated` against now, with a threshold of a few refresh intervals:

```bash
now=$(( $(date +%s) * 1000 ))
last=$(curl -fsS http://127.0.0.1:36661/status | sed -n 's/.*"last_updated":\([0-9]*\).*/\1/p')
age=$(( (now - last) / 60000 ))
[ "$age" -lt 30 ] || echo "Currencyinfo rates are ${age} minutes old"
```

## Logs

The service writes to stdout and to a file, both filtered by the same level.

| Property | Value |
| --- | --- |
| Directory | `./logs`, relative to the working directory, mode `0750` |
| File | One per start, named `YYYY-MM-DD HH-MM-SS.log`, mode `0600` |
| Rotation | None built in |
| Levels | `none` < `error` < `warn` < `log` < `info` |

```jsonc
{
  "log_level": "log"
}
```

`log` is the production default: startup, configuration, each cycle's outcome, and every warning and error. `info` adds a line per source per cycle and is for diagnosis. `error` is for a deployment where alerts go to a channel instead.

Secrets are redacted before anything is written. API keys, webhook URLs, connection strings, and bearer tokens are stripped from messages, from Axios error URLs, and from request parameters.

### Container logs

The log directory inside the image is owned by `node` and is not a volume, so a container restart discards it. Read stdout instead, and let the container runtime handle retention:

```bash
docker compose logs -f --tail=200 app
```

```yaml
services:
  app:
    logging:
      driver: json-file
      options:
        max-size: '10m'
        max-file: '5'
```

Mount a volume at `/usr/src/currencyinfo/logs` only if you want the files to persist, and give it UID and GID `1000`.

### File rotation for a source installation

Nothing rotates `logs/`, and a new file is created on every start. For a long-running service, add logrotate:

```
/opt/currencyinfo/logs/*.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
    create 0600 currencyinfo currencyinfo
}
```

## Outbound network

Currencyinfo makes outbound HTTPS requests only to the providers you enable, plus the notification channels you configure. Nothing else leaves the process: there is no telemetry, no analytics, and no update check.

For an allowlisted egress, the hosts are:

| Host | Used by |
| --- | --- |
| `api.coinpaprika.com` | CoinPaprika |
| `api.coinlore.net` | CoinLore |
| `api.binance.com` | Binance |
| `open.er-api.com` | ExchangeRate-API |
| `cdn.jsdelivr.net` | Currency API, default URL |
| `api.coingecko.com` | CoinGecko |
| `pro-api.coinmarketcap.com` | CoinMarketCap |
| `api.exchangerate.host` | ExchangeRate.host |
| `rusdoor.adamant.im` | MOEX, default proxy URL |
| `min-api.cryptocompare.com` | CryptoCompare |
| `hooks.slack.com` | Slack notifications |
| `discord.com` | Discord notifications |
| ADAMANT nodes | ADAMANT Messenger notifications |

Each request has a 10 second timeout, and 15 seconds for the CoinGecko directory download.

## Resource expectations

| Resource | Typical | Notes |
| --- | --- | --- |
| RSS | 120–200 MB | Dominated by the Node.js runtime, not by the rate table |
| CPU | Near zero between cycles | A cycle is a handful of HTTPS requests and some arithmetic |
| Disk, application | ~200 MB | Image plus production dependencies |
| Disk, database | Grows with history | See [growth and retention](./history.md#growth-and-retention) |

Coin discovery at startup is the heaviest moment: CoinPaprika downloads a ~1.4 MB gzipped directory, and CoinLore a ~0.4 MB one when symbols need resolving.

## Restart behaviour

- restarting is always safe. The in-memory table is rebuilt from the first cycle, which starts immediately
- there is a readiness gap of tens of seconds while discovery and the first cycle run. `/get` returns an empty result set during it, and `/status` reports `ready: false`
- history is unaffected. Snapshots are already durable
- to avoid the gap in a zero-downtime setup, start the new instance, wait for `ready: true`, then switch the proxy upstream

## Multiple instances

Two instances writing to the same database both write snapshots, which doubles the history without adding accuracy. Either give each instance its own `server.mongodb.db`, or run one writer and put a read-through cache in front of it.

There is no leader election and no coordination between instances.

## Operational checklist

- `config.jsonc` is mode `600` and owned by the runtime user
- `/status` is polled by something that alerts on `ready: false` and on a stale `last_updated`
- Notifications go to a channel someone actually reads — see [notifications](./notifications.md)
- Database backups run on a schedule — see [backup](./upgrading.md#backup)
- Log retention is bounded, by logrotate or by the container runtime
- The pinned image tag is a version, not `latest`
- Provider quotas match your `refreshInterval` — see the [source reference](../reference/sources/)
