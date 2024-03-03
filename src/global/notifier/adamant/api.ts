import { AdamantApi } from 'adamant-api';

const nodes = [
  'https://endless.adamant.im',
  'https://clown.adamant.im',
  'http://23.226.231.225:36666',
  'http://88.198.156.44:36666',
  'https://lake.adamant.im',
];

export const api = new AdamantApi({
  nodes,
  checkHealthAtStartup: false,
});
