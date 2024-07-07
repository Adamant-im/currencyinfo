import fs from 'fs';

const packageJson = fs.readFileSync('./package.json', 'utf-8');
const pkg = JSON.parse(packageJson);

export const version = pkg.version;
