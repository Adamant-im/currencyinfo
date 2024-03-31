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

- Docker
- docker-compose

### Setup

```
git clone https://github.com/Adamant-im/currencyinfo
cd currencyinfo
pnpm run prestart
```

### Pre-launch tuning

```
cp config.default.jsonc config.jsonc
nano config.jsonc
```

If you are migrating from v3, you can use this command to copy your old configuration:

```
pnpm run migrate ../path/to/your/old/config.json
```

## Launching

Before launching, you need to build the app using the following command:

```
sudo docker compose -f docker-compose.prod.yaml build
```

After that, you can start the ADAMANT Currencyinfo with the following command:

```
sudo docker compose -f docker-compose.prod.yaml up -d
```

## Usage

To test if Currencyinfo was successfully installed, try to this command:

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

For usage, see [InfoServices API documentation](https://github.com/Adamant-im/currencyinfo/wiki/InfoServices-API-documentation).
