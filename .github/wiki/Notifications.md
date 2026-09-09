# Notifications — moved

> [!IMPORTANT]
> This page is **deprecated** and no longer updated. The maintained documentation is at **<https://currencyinfo.docs.adamant.im/guide/notifications>**.

- [Slack](https://currencyinfo.docs.adamant.im/guide/notifications#slack)
- [Discord](https://currencyinfo.docs.adamant.im/guide/notifications#discord)
- [ADAMANT Messenger](https://currencyinfo.docs.adamant.im/guide/notifications#adamant-messenger)

## What changed since this page was written

> [!CAUTION]
> The examples on this page were **secret-shaped**: they used a realistic 12-word passphrase and plausible webhook URLs. Every example credential in the new documentation is unmistakably synthetic and will not authenticate anywhere.
>
> If you ever copied a credential from a wiki page, an issue, or a pull request into a live configuration, rotate it.

- Slack and Discord webhook URLs and ADAMANT addresses are **validated at startup**, so a malformed entry fails the configuration instead of failing silently at the first alert
- The shipped `notify.adamantPassphrase` placeholder is recognised as a placeholder and treated as **no passphrase at all**, so listing ADAMANT addresses without replacing it fails loudly at startup
- The new page documents which conditions actually trigger a notification, and how to reduce the volume when a channel is noisy
