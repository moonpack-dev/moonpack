import { dirname, join, normalize, relative } from 'node:path';
import { fileExists } from '../utils/fs.ts';

export interface ResolveContext {
  sourceRoot: string;
  currentFile: string;
}

export interface ResolvedModule {
  moduleName: string;
  filePath: string;
}

export interface ResolveResult {
  resolved: ResolvedModule | null;
}

export async function resolveModulePath(
  requirePath: string,
  context: ResolveContext
): Promise<ResolveResult> {
  const currentDir = dirname(context.currentFile);
  const targetPath = normalize(join(currentDir, requirePath));

  const luaPath = targetPath.endsWith('.lua') ? targetPath : `${targetPath}.lua`;
  if (await fileExists(luaPath)) {
    const moduleName = normalizeModuleName(luaPath, context.sourceRoot);
    return { resolved: { moduleName, filePath: luaPath } };
  }

  const initPath = join(targetPath, 'init.lua');
  if (await fileExists(initPath)) {
    const moduleName = normalizeModuleName(initPath, context.sourceRoot);
    return { resolved: { moduleName, filePath: initPath } };
  }

  return { resolved: null };
}

export function normalizeModuleName(filePath: string, sourceRoot: string): string {
  const rel = relative(sourceRoot, filePath);
  return rel
    .replace(/\.lua$/, '')
    .replace(/[/\\]init$/, '')
    .replace(/\\/g, '/');
}

export function getModuleNameFromPath(filePath: string, sourceRoot: string): string {
  return normalizeModuleName(filePath, sourceRoot);
}
