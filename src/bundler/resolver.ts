import { join } from "node:path";
import { fileExists } from "../utils/fs.ts";

export interface ResolveContext {
  sourceRoot: string;
  external: Set<string>;
}

export interface ResolvedModule {
  moduleName: string;
  filePath: string;
}

export interface ResolveResult {
  resolved: ResolvedModule | null;
  isExternal: boolean;
}

/** Resolves a Lua module name to a file path. Checks for `name.lua` first, then `name/init.lua`. Dot notation maps to directories. */
export async function resolveModulePath(
  moduleName: string,
  context: ResolveContext
): Promise<ResolveResult> {
  if (context.external.has(moduleName)) {
    return { resolved: null, isExternal: true };
  }

  if (isExternalPattern(moduleName, context.external)) {
    return { resolved: null, isExternal: true };
  }

  const pathFromDots = moduleName.replace(/\./g, "/");

  const directPath = join(context.sourceRoot, `${pathFromDots}.lua`);
  if (await fileExists(directPath)) {
    return {
      resolved: { moduleName, filePath: directPath },
      isExternal: false,
    };
  }

  const initPath = join(context.sourceRoot, pathFromDots, "init.lua");
  if (await fileExists(initPath)) {
    return {
      resolved: { moduleName, filePath: initPath },
      isExternal: false,
    };
  }

  return { resolved: null, isExternal: false };
}

function isExternalPattern(moduleName: string, external: Set<string>): boolean {
  for (const ext of external) {
    if (moduleName.startsWith(ext + ".")) {
      return true;
    }
  }
  return false;
}

export function getModuleNameFromPath(filePath: string, sourceRoot: string): string {
  const relative = filePath
    .replace(sourceRoot, "")
    .replace(/^[/\\]/, "")
    .replace(/\.lua$/, "")
    .replace(/[/\\]init$/, "");

  return relative.replace(/[/\\]/g, ".");
}
