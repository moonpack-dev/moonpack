import { MoonpackError } from '../utils/errors.ts';

/** A file entry in the files array - either a string path or an object with remapping */
export type DependencyFileEntry =
  | string
  | { path: string; src: string }
  | { path: string; url: string };

/** A dependency source with baseUrl and files array */
export interface DependencySource {
  baseUrl: string;
  destination?: string;
  files: DependencyFileEntry[];
  /** Additional direct path→url mappings */
  [key: string]: string | DependencyFileEntry[] | undefined;
}

/** Dependencies can be a single source object or an array of sources */
export type DependencyConfig = DependencySource | DependencySource[];

export interface MoonpackConfig {
  name: string;
  version?: string | undefined;
  author?: string | string[] | undefined;
  description?: string | undefined;
  url?: string | undefined;
  entry: string;
  outDir: string;
  dependencies?: DependencyConfig | undefined;
  ui?: { color?: string } | undefined;
}

export interface RawConfig {
  name?: unknown;
  version?: unknown;
  author?: unknown;
  description?: unknown;
  url?: unknown;
  entry?: unknown;
  outDir?: unknown;
  dependencies?: unknown;
  ui?: unknown;
}

function validateFileEntry(entry: unknown, context: string): string[] {
  if (typeof entry === 'string') {
    return entry.length === 0 ? [`${context}: file path cannot be empty`] : [];
  }

  if (typeof entry !== 'object' || entry === null) {
    return [`${context}: must be a string or object`];
  }

  const obj = entry as Record<string, unknown>;
  const errors: string[] = [];

  const pathVal = obj['path'];
  if (typeof pathVal !== 'string' || pathVal.length === 0) {
    errors.push(`${context}: 'path' is required and must be a non-empty string`);
  }

  const hasSrc = 'src' in obj;
  const hasUrl = 'url' in obj;

  if (!hasSrc && !hasUrl) {
    errors.push(`${context}: must have either 'src' or 'url'`);
  } else if (hasSrc && hasUrl) {
    errors.push(`${context}: cannot have both 'src' and 'url'`);
  } else if (hasSrc && typeof obj['src'] !== 'string') {
    errors.push(`${context}: 'src' must be a string`);
  } else if (hasUrl && typeof obj['url'] !== 'string') {
    errors.push(`${context}: 'url' must be a string`);
  }

  return errors;
}

function validateDependencySource(source: unknown, context: string): string[] {
  if (typeof source !== 'object' || source === null) {
    return [`${context}: must be an object`];
  }

  const obj = source as Record<string, unknown>;
  const errors: string[] = [];

  const baseUrlVal = obj['baseUrl'];
  if (typeof baseUrlVal !== 'string' || baseUrlVal.length === 0) {
    errors.push(`${context}: 'baseUrl' is required and must be a non-empty string`);
  }

  const filesVal = obj['files'];
  if (!Array.isArray(filesVal)) {
    errors.push(`${context}: 'files' is required and must be an array`);
  } else {
    for (let i = 0; i < filesVal.length; i++) {
      errors.push(...validateFileEntry(filesVal[i], `${context}.files[${i}]`));
    }
  }

  const destinationVal = obj['destination'];
  if (destinationVal !== undefined && typeof destinationVal !== 'string') {
    errors.push(`${context}: 'destination' must be a string if provided`);
  }

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'baseUrl' || key === 'files' || key === 'destination') continue;
    if (typeof value !== 'string') {
      errors.push(`${context}.${key}: direct mapping must be a string URL`);
    }
  }

  return errors;
}

function validateDependencies(deps: unknown): string[] {
  if (Array.isArray(deps)) {
    const errors: string[] = [];
    for (let i = 0; i < deps.length; i++) {
      errors.push(...validateDependencySource(deps[i], `dependencies[${i}]`));
    }
    return errors;
  }

  return validateDependencySource(deps, 'dependencies');
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

  if (raw.dependencies !== undefined) {
    const depErrors = validateDependencies(raw.dependencies);
    errors.push(...depErrors);
  }

  if (raw.ui !== undefined) {
    if (typeof raw.ui !== 'object' || raw.ui === null || Array.isArray(raw.ui)) {
      errors.push("'ui' must be an object if provided");
    } else {
      const ui = raw.ui as { color?: unknown };
      if (ui.color !== undefined && typeof ui.color !== 'string') {
        errors.push("'ui.color' must be a string if provided");
      }
      if (typeof ui.color === 'string' && !/^[0-9A-Fa-f]{6}$/.test(ui.color)) {
        errors.push("'ui.color' must be a 6-character hex color (e.g., 'FFAA00')");
      }
    }
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
    dependencies: raw.dependencies as DependencyConfig | undefined,
    ui: raw.ui as { color?: string } | undefined,
  };
}
