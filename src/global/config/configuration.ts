import { existsSync, readFileSync } from 'fs';
import JSON5 from 'json5';
import { schema, Schema } from './schema';

const isDev = process.argv.includes('dev');

export default () => {
  const configPath = findConfig();

  if (!configPath) {
    console.error(`No config found. Cannot start the app.`);
    process.exit(-1);
  }

  const json = readFileSync(configPath, 'utf-8');
  const userConfig: Schema = JSON5.parse(json);

  const result = schema.safeParse(userConfig);

  if (!result.success) {
    const message = formatZodErrors(result.error.format());

    console.error(`App's config is wrong:\n${message}Cannot start the app.`);
    process.exit(-1);
  }

  console.info(
    `InfoService successfully read a config-file '${configPath}'${
      isDev ? ' (dev)' : ''
    }.`,
  );

  return userConfig;
};

function findConfig() {
  if (isDev || process.env.JEST_WORKER_ID) {
    if (existsSync('./config.test.jsonc')) {
      return './config.test.jsonc';
    }
  }

  if (existsSync('./config.jsonc')) {
    return './config.jsonc';
  }
}

function formatZodErrors(errors: any, tab = 0, property?: string) {
  let output = '';

  if (property) {
    const indent = '  '.repeat(tab);

    output += `${indent}${property}: `;
  }

  if (errors._errors?.length) {
    output += `${errors._errors.join(', ')}`;
  }

  if (output.trim().length) {
    output += '\n';
  }

  for (const key in errors) {
    if (key === '_errors') {
      continue;
    }

    const error = errors[key];

    output += formatZodErrors(error, tab + 1, key);
  }

  return output;
}
