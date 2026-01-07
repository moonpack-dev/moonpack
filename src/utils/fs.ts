import { mkdir } from "node:fs/promises";

export async function fileExists(path: string): Promise<boolean> {
  return Bun.file(path).exists();
}

export async function readTextFile(path: string): Promise<string> {
  return Bun.file(path).text();
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await Bun.write(path, content);
}

export async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}
