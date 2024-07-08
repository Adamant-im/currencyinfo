# <sub><img src="./.github/logo.png" height="30"></sub> CurrencyInfo <sup>v4</sup>

<i>Self-hosted crypto and fiat currency rates service provider.</i>

```md
GET http://localhost:36661/get?coin=ADM
```

```json
{
  "success": true,
  "date": 1720472096540,
  "result": {
    "ADM/USD": 0.02978666,
    "ADM/RUB": 2.652919086307
  },
  "last_updated": 1720472046060,
  "version": "4.0.0"
}
```

## Features

- 🏠 Self-hosted — Operate your own instance without relying on external services
- 🔍 Reliable Monitoring — Checks multiple sources for discrepancies and alerts on significant changes
- 📉 Efficient API Calls — Compatible with free API keys to minimize costs
- 📬 Notification Integration — Sends alerts via Slack, Discord, and [ADAMANT Messenger](https://adamant.im)
- 📊 Local Rate History — Stores rate history on the server, eliminating additional requests
- 🛠 Easy Setup — Configuration via a simple config file
- 🚀 Fast Performance — Provides RESTful API access with minimal hardware requirements
- 🔓 Open-source — Free for any use

## Exchange Rates API

<img src="./.github/banner-light.png#gh-light-mode-only" height="320" align="right">
<img src="./.github/banner-dark.png#gh-dark-mode-only" height="320" align="right">

<p align="left">
CurrencyInfo collects data from several sources to provide the most accurate currency rates. The sources are listed below:

<ul>
  <li><a href="https://moex.com">MOEX</a> — Moscow Exchange for fiat currencies mostly.
  </li>
  <li><a href="https://github.com/fawazahmed0/exchange-api">Currency API</a> — Free fiat currency exchange rates API.
  </li>
  <li><a href="https://exchangerate.host">ExchangeRate</a> — Simple and lightweight service for world currencies, precious metals and Bitcoin.
  </li>
  <li><a href="https://coinmarketcap.com">CoinMarketCap</a> — Crypto coin rates updating every single minute.
  </li>
  <li><a href="https://cryptocompare.com">CryptoCompare</a> — Exchange rate API that provides comprehensive crypto coin and fiat list with frequent updates.
  </li>
  <li><a href="https://coingecko.com">CoinGecko</a> — Broad crypto coin list with data stably refreshed every 1 to 5 minutes.
  </li>
</ul>

</p>

## Installation

Please follow the documentation at [Github Wiki](https://github.com/Adamant-im/currencyinfo/wiki/Installation)

## Usage

For usage, see [CurrencyInfo API documentation](https://github.com/Adamant-im/currencyinfo/wiki/API-specification).

<h1></h1>

<p align="center">Licensed under <a href="https://github.com/adamant-im/currencyinfo?tab=GPL-3.0-1-ov-file#readme">GPL-3.0</a>, created by ADAMANT.</p>
