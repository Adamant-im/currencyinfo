# Currencyinfo Services

> Self-hosted crypto and fiat currency rates service provider.

It collects rates from **MOEX, Currency-Api, and ExchangeRate for fiat tickers**, and **Coinmarketcap, CryptoCompare, and Coingecko for crypto tickers**, calculates cross-rates, and provides information via API.

- Self-hosted
- Reliable: Checks multiple sources for discrepancies and notifies about significant deviation
- Minimal API calls: Compatible with free API keys
- Notifications: Slack, Discord, ADAMANT Messenger
- Stores rate history on server: No extra requests needed
- Easy to set up: Using config file
- Provides RESTful API access with fast performance and low hardware needs
- Open-source: Free for any use

## Installation

Please follow the documentation at [Github Wiki](https://github.com/Adamant-im/currencyinfo/wiki/Installation)

For development setup, see [CONTRIBUTING.md](./.github/CONTRIBUTING.md)

## Usage

To test if Currencyinfo was successfully installed, try to run this command:

```
curl -L http://localhost:36661/get?coin=ADM
```

Example response:

```json
{
  "success": true,
  "date": 1711925331578,
  "result": {},
  "last_updated": 1711925043818,
  "version": "4.0.0"
}
```

For usage, see [InfoServices API documentation](https://github.com/Adamant-im/currencyinfo/wiki/API-specification).
