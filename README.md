# Currencyinfo Services

> Self-hosted crypto and fiat currency rates service provider.

It collects rates from **MOEX, Currency-Api, and ExchangeRate for fiat tickers**, and **Coinmarketcap, CryptoCompare, and Coingecko for crypto tickers**, calculates cross-rates, and provides information via API.

- Self-hosted
- Reliable: Checks multiple sources for discrepancies
- Minimal API calls: Compatible with free API keys
- Notifications: Slack, Discord, ADAMANT Messenger
- Stores rate history on server: No extra requests needed
- Easy to set up: Using config file
- Provides RESTful API access with fast performance and low hardware needs
- Open-source: Free for any use
- Reliable: uses different sources for one coin, and notifies about significant deviation

## Installation

### Requirements

- NodeJS
- MongoDB
- Redis
- pnpm

### Setup

```
$ git clone https://github.com/Adamant-im/currencyinfo
$ cd currencyinfo
$ pnpm i
```

### Pre-launch tuning

```
nano config.jsonc
```

Parameters:

```jsonc
{
  "decimals": 12, // Number of decimal places for rate values.
  "rateDifferencePercentThreshold": 25, // Percentage threshold for notifying significant rate deviations.
  "refreshInterval": 10, // Frequency of rate updates from sources, in minutes (optional).
  "minSources": 1 // Minimum number of sources required for rate calculation.

  "port": 3000, // Port number for the API service.

  "passphrase": "apple banana...", // Secret passphrase for ADAMANT notifications (optional).
  "notify": {
    // Array of Slack webhook URLs for sending notifications (optional).
    "slack": ["https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX"],

    // Array of Discord webhook URLs for sending notifications (optional).
    "discord": ["https://discord.com/api/webhooks/123456789012345678/aBCdeFg9h0iJKl1-_mNoPqRST2uvwXYZ3ab4cDefgH5ijklmnOPQrsTuvWxYZaBC-de_"],

    // Array of ADAMANT addresses for sending notifications (optional).
    "adamant": ["U1234567890"],
  },
  "log_level": "warn", // Specifies the verbosity of logs (none, log, info, warn, error).

  // Record of fiat pairs and their codes to fetch rates from MOEX.
  "moex": {
    "USD/RUB": "USDRUB_TOM",
    "EUR/RUB": "EURRUB_TOM",
    // ...
  },
  "base_coins": ["USD", "RUB"], // 'List of base coins for calculating all available pairs.

  "exchange_rate_host": {
    "enabled": true, // Enable or disable ExchangeRate API (optional).
    "api_key": "API key for ExchangeRate."
  },

  "coinmarketcap": {
    "enabled": true, // Enable or disable CoinMarketCap API (optional).
    "api_key": "API key for CoinMarketCap.",
    "coins": [ // List of coins to fetch rates from CoinMarketCap (optional).
      "BTC",
      "ETH",
      // ...
    ],
    "ids": { // Record of CoinMarketCap Symbol-Id pairs for specific coin rates (optional).
      "ADM": 3703,
      "XCN": 18679,
      // ...
    }
  },

  "cryptocompare": {
    "enabled": true, // Enable or disable CryptoCompare API (optional).
    "api_key": "API key for CryptoCompare.",
    "coins": [ // List of coins to fetch rates from CryptoCompare (optional).
      "BTC",
      "ETH",
      // ...
    ]
  },

  "coingecko": {
    "enabled": true, // Enable or disable CoinGecko API (optional).
    "coins": [ // List of coins to fetch rates from CoinGecko (optional).
      "BTC",
      "ETH",
      // ...
    ],
    "ids": [ // Array of CoinGecko coin IDs for specific coin rates (optional).
      "adamant-messenger",
      "bitcoin",
      // ...
    ],
  },
}
```

## Launching

Before launching, you need to build the app using the following command:

```
npm run build
```

After that, you can start the ADAMANT Currencyinfo with `npm run start:prod` command, but it's recommended to use process manager:

```
pm2 start npm --name "currency-info" -- run start:prod
```

### Cron

```
crontab -e
```

Add string:

```
@reboot cd /home/adamant/currencyinfo && pm2 start npm --name "currency-info" -- run start:prod
```

## Usage

To test Currencyinfo successfully installed, try to open link
http://IP:36668/get?coin=ADM in a web browser.

For usage see [InfoServices API documentation](https://github.com/Adamant-im/currencyinfo/wiki/InfoServices-API-documentation).
