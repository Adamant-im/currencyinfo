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

Docker is the recommended way to run Currencyinfo.

### Configuration

Using [this sample file](./config.default.jsonc)

### Docker Compose

It is recommended to use Docker Compose to manage the various docker containers, if your MongoDB and Redis are running in the cloud then you may skip this step and run the single Currencyinfo docker container directly.

1. Install [Docker Compose](https://docs.docker.com/compose/install/)
2. Optionally, you can create `docker-compose.override.yml` file to set custom port or restart policy:

```yaml
services:
  app:
    restart: no
    ports:
      - '8080:8080'
```

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
docker compose -f docker-compose.prod.yaml build
```

After that, you can start the ADAMANT Currencyinfo with the following command:

```
docker compose -f docker-compose.prod.yaml up -d
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
