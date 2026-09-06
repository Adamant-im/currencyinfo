# Wiki tombstones

The GitHub Wiki at <https://github.com/Adamant-im/currencyinfo/wiki> is **deprecated**. Its content has been migrated into the version-controlled documentation site at <https://currencyinfo.docs.adamant.im>, corrected against the current code along the way.

This directory holds the replacement content for the wiki. The wiki lives in a separate git repository that GitHub does not let a normal pull request touch, so these files are kept here, reviewed here, and pushed from here.

## Why the wiki is kept at all

Deleting it would break every inbound deep link that exists in issues, forum posts, and third-party articles. Each page below keeps its original slug and redirects the reader to the canonical destination, so old links stay useful. The wiki is a tombstone, not a documentation surface: it receives no further content.

## What each page becomes

| Wiki page | Canonical destination |
| --- | --- |
| `Home` | <https://currencyinfo.docs.adamant.im/> |
| `Installation` | <https://currencyinfo.docs.adamant.im/guide/installation> |
| `API-specification` | <https://currencyinfo.docs.adamant.im/reference/api> |
| `Saved-rates-format` | <https://currencyinfo.docs.adamant.im/guide/history> |
| `Dealing-with-Rate-Differences-from-Multiple-Sources` | <https://currencyinfo.docs.adamant.im/guide/rate-calculation> |
| `Rate-life-time` | <https://currencyinfo.docs.adamant.im/guide/rate-calculation#freshness-ratelifetime> |
| `Notifications` | <https://currencyinfo.docs.adamant.im/guide/notifications> |

The full mapping, including what was corrected during migration, is published at <https://currencyinfo.docs.adamant.im/project/documentation-map>.

## Corrections made during migration

The old pages were not merely moved. These were wrong and are fixed in the new documentation:

- **`groupPercentage` was described backwards.** The wiki called it "the share of sources a group must contain". It is the minimum relative distance between the weights of the two heaviest groups
- **The API examples used port `36668`.** The default is `36661`
- **`rateLiftime` was a typo** for `rateLifetime`
- **Installation required Node.js v20.** The service requires v22 or newer
- **The contributing link pointed at `.github/CONTRIBUTING.md`**, which no longer exists; it is `CONTRIBUTING.md` at the repository root
- **`Saved-rates-format` claimed USD is the only base coin by default.** The shipped template configures seven base coins
- **`Notifications` carried secret-shaped examples**, including a realistic 12-word passphrase. Every example credential in the new documentation is unmistakably synthetic
- **The source list predated the current connector set**, which now includes CoinPaprika, CoinLore, Binance, and ExchangeRate-API, and treats CryptoCompare as deprecated

## Publishing these pages

The wiki is a separate repository. Publishing requires push access to it, and is a manual step performed once, after the documentation site is live at its custom domain.

```bash
git clone https://github.com/Adamant-im/currencyinfo.wiki.git /tmp/currencyinfo-wiki
cp .github/wiki/*.md /tmp/currencyinfo-wiki/
rm /tmp/currencyinfo-wiki/README.md   # this file is not a wiki page
cd /tmp/currencyinfo-wiki
git add -A
git commit -m "docs: deprecate the wiki in favour of currencyinfo.docs.adamant.im"
git push
```

Order matters: publish the documentation site and verify HTTPS on `currencyinfo.docs.adamant.im` **before** pushing these pages, so the links they point at resolve.

Do not disable the wiki afterwards. Disabling it makes every deep link a 404, which is the outcome these tombstones exist to prevent. Revisit that only once inbound traffic to the wiki has stopped.
