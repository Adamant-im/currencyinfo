import { existsSync, readFileSync } from 'fs';
import JSON5 from 'json5';
import { schema, Schema } from './schema';

const isDev = process.env.NODE_ENV === 'development';

/**
 * Loads and validates configuration from JSONC configuration files.
 * Checks config.test.jsonc, config.jsonc, and falls back to config.default.jsonc in development.
 *
 * @returns Validated configuration object
 */
export default (): Schema => {
  const configPath = findConfig();

  if (!configPath) {
    console.error('No configuration file found. Cannot start the app.');
    process.exit(-1);
  }

  const json = readFileSync(configPath, 'utf-8');
  const userConfig: Schema = JSON5.parse(json);

  const result = schema.safeParse(userConfig);

  if (!result.success) {
    const message = formatZodErrors(result.error.format());

    console.error(`App configuration is invalid:\n${message}Cannot start the app.`);
    process.exit(-1);
  }

  console.info(
    `InfoService successfully read the configuration file '${configPath}'${isDev ? ' (dev)' : ''}.`,
  );

  return result.data;
};

/**
 * Resolves the configuration file path based on environment and availability.
 */
function findConfig(): string | undefined {
  if (isDev || process.env.JEST_WORKER_ID) {
    if (existsSync('./config.test.jsonc')) {
      return './config.test.jsonc';
    }
    if (existsSync('./config.default.jsonc')) {
      return './config.default.jsonc';
    }
  }

  if (existsSync('./config.jsonc')) {
    return './config.jsonc';
  }
}

/**
 * Formats Zod validation errors into human-readable multiline string.
 */
function formatZodErrors(errors: any, tab = 0, property?: string): string {
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
