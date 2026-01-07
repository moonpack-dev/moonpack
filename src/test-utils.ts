import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TempDir {
  path: string;
  cleanup: () => Promise<void>;
}

export async function createTempDir(prefix = "moonpack-test-"): Promise<TempDir> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  return {
    path,
    cleanup: async () => {
      await rm(path, { recursive: true, force: true });
    },
  };
}

export interface FileStructure {
  [path: string]: string;
}

export async function createFileStructure(baseDir: string, files: FileStructure): Promise<void> {
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(baseDir, relativePath);
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, content);
  }
}

export async function createMoonpackConfig(
  dir: string,
  config: { name: string; entry: string; external?: string[]; outDir?: string; version?: string }
): Promise<void> {
  await writeFile(join(dir, "moonpack.json"), JSON.stringify(config, null, 2));
}
