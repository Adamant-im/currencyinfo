import { defineConfig } from 'vitepress';

const hostname = 'https://currencyinfo.docs.adamant.im';
const repository = 'https://github.com/Adamant-im/currencyinfo';

export default defineConfig({
  title: 'Currencyinfo',
  description:
    'Universal self-hosted crypto and fiat exchange rates service aggregating multiple sources behind one REST API.',
  lang: 'en-US',
  cleanUrls: true,
  metaChunk: true,
  lastUpdated: true,

  sitemap: {
    hostname,
  },

  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/logo.png' }],
    ['meta', { name: 'theme-color', content: '#1f7a64' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: 'Currencyinfo Documentation' }],
    ['meta', { property: 'og:image', content: `${hostname}/banner-light.png` }],
  ],

  // Canonical metadata. No analytics or third-party telemetry is loaded anywhere on this site.
  transformPageData(pageData) {
    const path = pageData.relativePath.replace(/index\.md$/, '').replace(/\.md$/, '');

    pageData.frontmatter.head ??= [];
    pageData.frontmatter.head.push(['link', { rel: 'canonical', href: `${hostname}/${path}` }]);
  },

  themeConfig: {
    logo: '/logo.png',
    siteTitle: 'Currencyinfo',

    nav: [
      { text: 'Guide', link: '/guide/', activeMatch: '/guide/' },
      { text: 'API', link: '/reference/api', activeMatch: '/reference/api' },
      { text: 'Configuration', link: '/reference/configuration' },
      { text: 'Sources', link: '/reference/sources/', activeMatch: '/reference/sources/' },
      {
        text: 'Links',
        items: [
          { text: 'Landing page', link: 'https://currencyinfo.dev' },
          { text: 'Source code', link: repository },
          { text: 'Releases', link: `${repository}/releases` },
          {
            text: 'Container image',
            link: 'https://github.com/Adamant-im/currencyinfo/pkgs/container/currencyinfo',
          },
        ],
      },
    ],

    sidebar: [
      {
        text: 'Introduction',
        collapsed: false,
        items: [
          { text: 'What is Currencyinfo', link: '/guide/' },
          { text: 'Architecture', link: '/guide/architecture' },
        ],
      },
      {
        text: 'Getting started',
        collapsed: false,
        items: [
          { text: 'Quick start with Docker', link: '/guide/quick-start' },
          { text: 'Installation', link: '/guide/installation' },
          { text: 'Upgrade and rollback', link: '/guide/upgrading' },
        ],
      },
      {
        text: 'Using the service',
        collapsed: false,
        items: [
          { text: 'Rate calculation', link: '/guide/rate-calculation' },
          { text: 'Rate history', link: '/guide/history' },
          { text: 'Notifications', link: '/guide/notifications' },
        ],
      },
      {
        text: 'Running in production',
        collapsed: false,
        items: [
          { text: 'Operations', link: '/guide/operations' },
          { text: 'Security', link: '/guide/security' },
          { text: 'Troubleshooting', link: '/guide/troubleshooting' },
        ],
      },
      {
        text: 'Reference',
        collapsed: false,
        items: [
          { text: 'REST API', link: '/reference/api' },
          { text: 'Configuration', link: '/reference/configuration' },
          {
            text: 'Rate sources',
            link: '/reference/sources/',
            collapsed: true,
            items: [
              { text: 'CoinPaprika', link: '/reference/sources/coinpaprika' },
              { text: 'CoinLore', link: '/reference/sources/coinlore' },
              { text: 'Binance', link: '/reference/sources/binance' },
              { text: 'ExchangeRate-API', link: '/reference/sources/exchangerate-api' },
              { text: 'Currency API', link: '/reference/sources/currency-api' },
              { text: 'CoinGecko', link: '/reference/sources/coingecko' },
              { text: 'CoinMarketCap', link: '/reference/sources/coinmarketcap' },
              { text: 'ExchangeRate.host', link: '/reference/sources/exchangerate-host' },
              { text: 'MOEX', link: '/reference/sources/moex' },
              { text: 'CryptoCompare', link: '/reference/sources/cryptocompare' },
            ],
          },
        ],
      },
      {
        text: 'Project',
        collapsed: false,
        items: [
          { text: 'Contributing', link: '/project/contributing' },
          { text: 'Release notes', link: '/project/releases' },
          { text: 'Documentation map', link: '/project/documentation-map' },
        ],
      },
    ],

    socialLinks: [{ icon: 'github', link: repository }],

    editLink: {
      pattern: `${repository}/edit/master/docs/:path`,
      text: 'Edit this page on GitHub',
    },

    search: {
      provider: 'local',
    },

    outline: [2, 3],

    footer: {
      message:
        'Released under the GPL-3.0 License. Maintained by the ADAMANT developer community.',
      copyright: 'Copyright © ADAMANT community developers',
    },
  },
});
