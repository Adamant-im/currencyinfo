---
layout: home

hero:
  name: Currencyinfo
  text: Universal self-hosted exchange rates service
  tagline: Aggregate crypto and fiat rates from many providers, validate them against each other, and serve them from your own infrastructure through one REST API.
  image:
    src: /logo.png
    alt: Currencyinfo
  actions:
    - theme: brand
      text: Quick start with Docker
      link: /guide/quick-start
    - theme: alt
      text: What is Currencyinfo
      link: /guide/
    - theme: alt
      text: REST API reference
      link: /reference/api

features:
  - title: Multi-source by design
    details: Ten connectors covering crypto exchanges, aggregators, and fiat providers. Five keyless sources are enabled by default, so a fresh install returns rates without any API key.
    link: /reference/sources/
    linkText: Rate sources
  - title: Disagreement is handled, not averaged away
    details: Quotes are grouped by relative distance, the dominant group wins, and divergence beyond your threshold raises an alert instead of silently shifting a rate.
    link: /guide/rate-calculation
    linkText: Rate calculation
  - title: Your data stays yours
    details: No telemetry, no analytics, no third-party tracking. The service talks to the rate providers you enable and to your own MongoDB, and to nothing else.
    link: /guide/security
    linkText: Security
  - title: Historical rates included
    details: Every refresh cycle stores a full snapshot in MongoDB, queryable by interval, by point in time, and by pair.
    link: /guide/history
    linkText: Rate history
  - title: Small enough for a shared VPS
    details: A NestJS service compiled with SWC plus MongoDB. One container, one database, no message broker, no cache tier.
    link: /guide/architecture
    linkText: Architecture
  - title: Configuration you can audit
    details: A single commented JSONC file, validated strictly at startup. Unknown keys, placeholder credentials, and impossible source combinations fail before the first request.
    link: /reference/configuration
    linkText: Configuration reference
---

## Install in one command

```bash
docker run -d \
  --name currencyinfo \
  -p 36661:36661 \
  -v "$(pwd)/config.jsonc:/usr/src/currencyinfo/config.jsonc:ro" \
  ghcr.io/adamant-im/currencyinfo:latest
```

```bash
curl "http://localhost:36661/get?coin=BTC,ETH"
```

```json
{
  "success": true,
  "date": 1720472096540,
  "result": {
    "BTC/USD": 95120.45,
    "BTC/EUR": 87510.2,
    "ETH/USD": 3420.12
  },
  "last_updated": 1720472046060,
  "version": "4.2.0"
}
```

See the [quick start](./guide/quick-start.md) for the configuration file and the Compose deployment.

## Who runs it

Currencyinfo is an independent open-source product. Anyone who needs exchange rates without handing their traffic and their coin list to a single commercial API can self-host it: wallets, payment processors, trading tools, accounting systems, dashboards, and research pipelines.

[ADAMANT](https://adamant.im) is a production adopter and the project steward. ADAMANT Messenger clients query a Currencyinfo deployment for every fiat amount they display, and the ADAMANT developer community maintains this repository. Nothing in the service is ADAMANT-specific: the ADM coin is one entry in the default coin lists, and removing it changes nothing else.

## Where to go next

- [What is Currencyinfo](./guide/) explains the product, the use cases, and the guarantees
- [Quick start with Docker](./guide/quick-start.md) gets a working instance up
- [Configuration reference](./reference/configuration.md) documents every option
- [REST API reference](./reference/api.md) documents `/get`, `/getHistory`, and `/status`
- [Rate sources](./reference/sources/) documents every connector, its quota, and its terms
