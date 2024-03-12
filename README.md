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

### Requirements

- NodeJS
- MongoDB
- Redis
- pnpm

### Setup

```
git clone https://github.com/Adamant-im/currencyinfo
cd currencyinfo
pnpm i
```

### Pre-launch tuning

```
cp config.default.jsonc config.jsonc
nano config.jsonc
```

## Launching

Before launching, you need to build the app using the following command:

```
pnpm run build
```

After that, you can start the ADAMANT Currencyinfo with `pnpm run start:prod` command, but it's recommended to use process manager:

```
pm2 start pnpm --name "currency-info" -- run start:prod
```

### Cron

```
crontab -e
```

Add string:

```
@reboot cd /home/adamant/currencyinfo && pm2 start pnpm --name "currency-info" -- run start:prod
```

## Usage

To test Currencyinfo successfully installed, try to open the link http://IP:36661/get?coin=ADM in a web browser.

For usage, see [InfoServices API documentation](https://github.com/Adamant-im/currencyinfo/wiki/InfoServices-API-documentation).
