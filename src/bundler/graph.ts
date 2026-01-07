import { MoonpackError } from '../utils/errors.ts';
import { readTextFile } from '../utils/fs.ts';
import { parseRequireStatements, type RequireStatement } from './parser.ts';
import { getModuleNameFromPath, type ResolveContext, resolveModulePath } from './resolver.ts';

export interface ModuleNode {
  moduleName: string;
  filePath: string;
  source: string;
  requires: RequireStatement[];
  dependencies: string[];
}

export interface DependencyGraph {
  entryPoint: ModuleNode;
  modules: Map<string, ModuleNode>;
  moduleOrder: string[];
}

export interface BuildGraphOptions {
  entryPath: string;
  sourceRoot: string;
  external: Set<string>;
}

/** Recursively resolves all dependencies and returns modules in topological order. Throws on circular dependencies. */
export async function buildDependencyGraph(options: BuildGraphOptions): Promise<DependencyGraph> {
  const { entryPath, sourceRoot, external } = options;
  const modules = new Map<string, ModuleNode>();
  const resolveContext: ResolveContext = { sourceRoot, external };

  const entrySource = await readTextFile(entryPath);
  const entryModuleName = getModuleNameFromPath(entryPath, sourceRoot);

  const entryNode: ModuleNode = {
    moduleName: entryModuleName,
    filePath: entryPath,
    source: entrySource,
    requires: parseRequireStatements(entrySource),
    dependencies: [],
  };

  modules.set(entryModuleName, entryNode);

  await processModuleDependencies(entryNode, modules, resolveContext);

  detectCircularDependencies(modules);

  const moduleOrder = topologicalSort(modules, entryModuleName);

  return {
    entryPoint: entryNode,
    modules,
    moduleOrder,
  };
}

async function processModuleDependencies(
  node: ModuleNode,
  modules: Map<string, ModuleNode>,
  context: ResolveContext
): Promise<void> {
  for (const req of node.requires) {
    const result = await resolveModulePath(req.moduleName, context);

    if (result.isExternal) {
      continue;
    }

    if (result.resolved === null) {
      throw new MoonpackError(
        `Cannot resolve module '${req.moduleName}' required at ${node.filePath}:${req.line}`,
        'MODULE_NOT_FOUND',
        {
          moduleName: req.moduleName,
          requiredBy: node.filePath,
          line: req.line,
        }
      );
    }

    node.dependencies.push(result.resolved.moduleName);

    if (modules.has(result.resolved.moduleName)) {
      continue;
    }

    const depSource = await readTextFile(result.resolved.filePath);
    const depNode: ModuleNode = {
      moduleName: result.resolved.moduleName,
      filePath: result.resolved.filePath,
      source: depSource,
      requires: parseRequireStatements(depSource),
      dependencies: [],
    };

    modules.set(result.resolved.moduleName, depNode);

    await processModuleDependencies(depNode, modules, context);
  }
}

function detectCircularDependencies(modules: Map<string, ModuleNode>): void {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];
  const foundCycles: string[][] = [];
  const seenCycleKeys = new Set<string>();

  function dfs(moduleName: string): void {
    visited.add(moduleName);
    recursionStack.add(moduleName);
    path.push(moduleName);

    const node = modules.get(moduleName);
    if (node) {
      for (const dep of node.dependencies) {
        if (!visited.has(dep)) {
          dfs(dep);
        } else if (recursionStack.has(dep)) {
          const cycleStart = path.indexOf(dep);
          const cycle = [...path.slice(cycleStart), dep];
          const cycleKey = normalizeCycleKey(cycle);

          if (!seenCycleKeys.has(cycleKey)) {
            seenCycleKeys.add(cycleKey);
            foundCycles.push(cycle);
          }
        }
      }
    }

    path.pop();
    recursionStack.delete(moduleName);
  }

  for (const moduleName of modules.keys()) {
    if (!visited.has(moduleName)) {
      dfs(moduleName);
    }
  }

  if (foundCycles.length > 0) {
    const cycleStrings = foundCycles.map((cycle) => cycle.join(' → '));
    const message =
      foundCycles.length === 1
        ? `Circular dependency detected: ${cycleStrings[0]}`
        : `Circular dependencies detected:\n  ${cycleStrings.join('\n  ')}`;

    throw new MoonpackError(message, 'CIRCULAR_DEPENDENCY', {
      cycles: foundCycles,
    });
  }
}

function normalizeCycleKey(cycle: string[]): string {
  const withoutLast = cycle.slice(0, -1);
  const sorted = [...withoutLast].sort();
  return sorted.join(',');
}

function topologicalSort(modules: Map<string, ModuleNode>, entryModuleName: string): string[] {
  const sorted: string[] = [];
  const visited = new Set<string>();

  function visit(moduleName: string): void {
    if (visited.has(moduleName)) return;
    visited.add(moduleName);

    const node = modules.get(moduleName);
    if (node) {
      for (const dep of node.dependencies) {
        visit(dep);
      }
    }

    sorted.push(moduleName);
  }

  visit(entryModuleName);

  return sorted;
}
