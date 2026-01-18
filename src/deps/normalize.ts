import type { DependencyConfig, DependencyFileEntry, DependencySource } from '../config/schema.ts';

/**
 * Normalizes any valid dependency config format into a flat path→url map.
 * This allows downstream code (size fetching, downloading, codegen) to work
 * with a simple Record<string, string> regardless of input format.
 */
export function normalizeDependencies(deps: DependencyConfig): Record<string, string> {
  const result: Record<string, string> = {};

  const sources = Array.isArray(deps) ? deps : [deps];

  for (const source of sources) {
    processSource(source, result);
  }

  return result;
}

function processSource(source: DependencySource, result: Record<string, string>): void {
  const { baseUrl, destination, files, ...directMappings } = source;

  for (const entry of files) {
    const { path, url } = resolveFileEntry(entry, baseUrl, destination);
    result[path] = url;
  }

  for (const [path, url] of Object.entries(directMappings)) {
    if (typeof url === 'string') {
      result[path] = url;
    }
  }
}

function resolveFileEntry(
  entry: DependencyFileEntry,
  baseUrl: string,
  destination?: string
): { path: string; url: string } {
  if (typeof entry === 'string') {
    return {
      path: joinPath(destination, entry),
      url: joinUrl(baseUrl, entry),
    };
  }

  if ('src' in entry) {
    return {
      path: joinPath(destination, entry.path),
      url: joinUrl(baseUrl, entry.src),
    };
  }

  return {
    path: joinPath(destination, entry.path),
    url: entry.url,
  };
}

function joinPath(prefix: string | undefined, path: string): string {
  if (!prefix) return path;
  const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return normalizedPrefix + normalizedPath;
}

function joinUrl(base: string, path: string): string {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return normalizedBase + normalizedPath;
}
