import { MoonpackError } from '../utils/errors.ts';

export interface MoonpackConfig {
  name: string;
  version?: string | undefined;
  author?: string | string[] | undefined;
  description?: string | undefined;
  url?: string | undefined;
  entry: string;
  outDir: string;
}

export interface RawConfig {
  name?: unknown;
  version?: unknown;
  author?: unknown;
  description?: unknown;
  url?: unknown;
  entry?: unknown;
  outDir?: unknown;
}

export function validateConfig(raw: RawConfig, configPath: string): MoonpackConfig {
  const errors: string[] = [];

  if (typeof raw.name !== 'string' || raw.name.length === 0) {
    errors.push("'name' is required and must be a non-empty string");
  }

  if (typeof raw.entry !== 'string' || raw.entry.length === 0) {
    errors.push("'entry' is required and must be a non-empty string");
  }

  if (raw.version !== undefined && typeof raw.version !== 'string') {
    errors.push("'version' must be a string if provided");
  }

  if (raw.author !== undefined) {
    const isString = typeof raw.author === 'string';
    const isStringArray =
      Array.isArray(raw.author) && raw.author.every((a) => typeof a === 'string');
    if (!isString && !isStringArray) {
      errors.push("'author' must be a string or array of strings if provided");
    }
  }

  if (raw.description !== undefined && typeof raw.description !== 'string') {
    errors.push("'description' must be a string if provided");
  }

  if (raw.url !== undefined && typeof raw.url !== 'string') {
    errors.push("'url' must be a string if provided");
  }

  if (raw.outDir !== undefined && typeof raw.outDir !== 'string') {
    errors.push("'outDir' must be a string if provided");
  }

  if (errors.length > 0) {
    throw new MoonpackError(
      `Invalid config at ${configPath}:\n  - ${errors.join('\n  - ')}`,
      'INVALID_CONFIG',
      { errors, configPath }
    );
  }

  return {
    name: raw.name as string,
    version: raw.version as string | undefined,
    author: raw.author as string | string[] | undefined,
    description: raw.description as string | undefined,
    url: raw.url as string | undefined,
    entry: raw.entry as string,
    outDir: typeof raw.outDir === 'string' ? raw.outDir : 'dist',
  };
}
