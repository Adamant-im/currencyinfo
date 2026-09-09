# Dealing with rate differences from multiple sources — moved

> [!IMPORTANT]
> This page is **deprecated** and no longer updated. The maintained documentation is at **<https://currencyinfo.docs.adamant.im/guide/rate-calculation>**.

- [Grouping: `rateDifferencePercentThreshold`](https://currencyinfo.docs.adamant.im/guide/rate-calculation#grouping-ratedifferencepercentthreshold)
- [Choosing the dominant group: `groupPercentage`](https://currencyinfo.docs.adamant.im/guide/rate-calculation#choosing-the-dominant-group-grouppercentage)
- [Resolving a rate: `strategy`](https://currencyinfo.docs.adamant.im/guide/rate-calculation#resolving-a-rate-strategy)
- [Coverage gate: `minSources`](https://currencyinfo.docs.adamant.im/guide/rate-calculation#coverage-gate-minsources)

## What changed since this page was written

> [!WARNING]
> This page described **`groupPercentage` incorrectly**. It called it "the percentage of sources needed in a group to consider it trustworthy". That is not what the code does.
>
> `groupPercentage` is the **minimum relative distance between the weights of the two heaviest groups**, measured with the same mean-based percentage formula used for grouping. The dominant group wins only when it outweighs the runner-up by more than `groupPercentage`; otherwise the pair is rejected as ambiguous and an alert is dispatched.
>
> Consequently `groupPercentage: 200` rejects every pair that splits into more than one group, and `groupPercentage: 0` accepts the heavier group unless the two are exactly tied.

- The source names in the examples predate the current connector set, which now includes **CoinPaprika, CoinLore, Binance, and ExchangeRate-API**, and treats **CryptoCompare** as deprecated
- The new page documents the exact percentage-difference formula, the group-overlap behaviour, and how the strategies interact with weights and priorities
