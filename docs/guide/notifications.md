# Notifications

Currencyinfo dispatches operational alerts to Slack, Discord, and [ADAMANT Messenger](https://adamant.im). Every channel is optional, all configured channels receive the same message, and a channel that fails is logged without affecting the others or the refresh cycle.

Notifications are operational, not a rate feed. They tell you that a provider is down, that sources disagree, or that a pair lost coverage.

::: danger Every example on this page is synthetic
The webhook URLs, addresses, and passphrases below are deliberately fake and will not authenticate anywhere. Never commit a real webhook URL or passphrase, and never paste one into an issue or a pull request. `config.jsonc` is git-ignored for this reason; keep it at mode `600`.
:::

## What triggers a notification

| Level | Trigger |
| --- | --- |
| `info` | Service started, with the version and the port |
| `warn` | One or more sources unreachable this cycle, while others still supplied rates |
| `warn` | A pair fell below its effective `minSources`, so the stored rate was not refreshed |
| `warn` | A pair was rejected but a fresh previous rate is still being served |
| `error` | A pair was rejected and there is no fresh previous rate to fall back on |
| `error` | Every source failed, so nothing was written for this cycle |
| `error` | The database write failed |
| `error` | A connector could not resolve its coin IDs after three attempts |

Messages are passed through the same redaction used for logs, so API keys, webhook URLs, and connection strings never appear in a notification body.

## Slack

### Create the webhook

1. Create a [new Slack app](https://api.slack.com/apps?new_app=1) in your workspace
2. Open **Features** → **Incoming Webhooks** and activate them
3. Click **Add New Webhook to Workspace** and pick the channel the alerts go to
4. Copy the generated webhook URL

### Configure

```jsonc
{
  "notify": {
    "slack": [
      "https://hooks.slack.com/services/T00000000/B00000000/REPLACE-WITH-YOUR-WEBHOOK-TOKEN"
    ]
  }
}
```

The URL is validated at startup against the documented Slack format `https://hooks.slack.com/services/T…/B…/…`. A malformed entry fails the configuration rather than failing silently at the first alert.

The placeholder above is deliberately not shaped like a real webhook: a genuine token is a 24-character alphanumeric string, and an example carrying that shape trips secret scanners in every repository that copies it. Replace the whole last path segment with the token Slack gave you.

List as many webhooks as you need; each one receives every alert. Alerts are colour-coded by severity, red for `error`, yellow for `warn`, green for `info`.

## Discord

### Create the webhook

1. Open **Server Settings** → **Integrations** in your Discord server
2. Click **Webhooks**, then **New Webhook**
3. Select the channel the alerts go to
4. Click **Copy Webhook URL**

### Configure

```jsonc
{
  "notify": {
    "discord": [
      "https://discord.com/api/webhooks/000000000000000000/EXAMPLE-ONLY-not-a-real-webhook-token"
    ]
  }
}
```

Both `discord.com` and the legacy `discordapp.com` host are accepted. The URL is validated at startup.

## ADAMANT Messenger

Alerts are delivered as encrypted blockchain messages from an account you control to the addresses you list. This is the channel that survives a third-party outage, since it depends on the ADAMANT network rather than on a SaaS webhook.

### Create the sending account

1. Generate a new passphrase at [adm.im](https://adm.im), or with [adamant-console](https://github.com/Adamant-im/adamant-console) for a terminal workflow
2. Use a **dedicated account** for this. The passphrase sits in a configuration file on a server, so it must not control funds you care about
3. Fund it with a small amount of ADM: sending a message costs a fee. A starter amount is available through [free ADM tokens](https://adamant.im/free-adm-tokens/)

### Configure

```jsonc
{
  "notify": {
    "adamantPassphrase": "example example example example example example example example example example example example",
    "adamant": ["U0000000000000000000"]
  }
}
```

- `adamantPassphrase` is the passphrase of the **sending** account
- `adamant` lists the **receiving** addresses, each `U` followed by 6 to 21 digits
- listing an address without a passphrase fails validation at startup with `Provide passphrase to use ADAMANT notifier`

The shipped template carries `"apple banana..."` in this field. It is recognised as a placeholder and treated as no passphrase at all, so leaving it in place while listing addresses fails loudly at startup instead of at the first alert.

## Instance name

Every message is prefixed with the configured instance name, which is how you tell several deployments apart in one channel:

```jsonc
{
  "name": "currencyinfo-eu-1"
}
```

```
**currencyinfo-eu-1**# Unable to fetch valid data from CoinPaprika.
```

## Disabling notifications

Omit the `notify` object entirely, or leave every channel empty. Alerts are still written to the log at their level, so nothing is lost — see [operations](./operations.md#logs).

```jsonc
{
  "log_level": "warn"
}
```

## Tuning the volume

If a channel is noisy, the cause is usually configuration rather than the notifier:

- **Repeated "unable to fetch" for one source.** That source is failing every cycle. Disable it, or fix its key. A retired free tier is the usual reason — see [CryptoCompare](../reference/sources/cryptocompare.md)
- **Repeated "fetched from fewer sources than expected".** `minSources` is above the real coverage of those pairs. Lower it, or add a source that quotes them — see [coverage gate](./rate-calculation.md#coverage-gate-minsources)
- **Repeated "the difference between sources is too big".** `rateDifferencePercentThreshold` and `groupPercentage` are stricter than your source mix supports, or one provider is genuinely wrong. Check which sources the message names before loosening anything
- **A burst at every restart.** Coin discovery runs at startup, and a provider that rate-limits the directory download reports it. Space out restarts, or reduce the configured coin lists
