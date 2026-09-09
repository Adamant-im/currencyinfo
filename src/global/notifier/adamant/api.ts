import { AdamantApi } from 'adamant-api';

/**
 * Known active ADAMANT blockchain consensus and API nodes.
 */
const nodes = [
  'https://endless.adamant.im',
  'https://clown.adamant.im',
  'http://23.226.231.225:36666',
  'http://88.198.156.44:36666',
  'https://lake.adamant.im',
];

/**
 * Shared AdamantApi client instance for blockchain notifications.
 */
export const api = new AdamantApi({
  nodes,
  checkHealthAtStartup: false,
});
