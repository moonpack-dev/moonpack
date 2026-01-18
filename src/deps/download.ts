import { dirname, join } from 'node:path';
import { MoonpackError } from '../utils/errors.ts';
import { ensureDirectory } from '../utils/fs.ts';

export async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new MoonpackError(
      `Failed to download ${url}: HTTP ${response.status}`,
      'DEPENDENCY_DOWNLOAD_ERROR',
      { url, destPath, status: response.status }
    );
  }

  const buffer = await response.arrayBuffer();
  const dir = dirname(destPath);
  await ensureDirectory(dir);
  await Bun.write(destPath, buffer);
}

export async function downloadAllDeps(
  deps: Record<string, string>,
  baseDir: string,
  onProgress?: (current: number, total: number, path: string) => void
): Promise<{ downloaded: string[]; errors: Array<{ path: string; error: string }> }> {
  const downloaded: string[] = [];
  const errors: Array<{ path: string; error: string }> = [];
  const entries = Object.entries(deps);

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const [path, url] = entry;
    const destPath = join(baseDir, path);
    onProgress?.(i + 1, entries.length, path);

    try {
      await downloadFile(url, destPath);
      downloaded.push(path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ path, error: message });
    }
  }

  return { downloaded, errors };
}
