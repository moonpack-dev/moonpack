import type { DependencyGraph } from './graph.ts';
import type { LintResult } from './lint.ts';

export interface ModuleStats {
  moduleName: string;
  filePath: string;
  size: number;
  warnings: string[];
}

export interface BundleStats {
  modules: ModuleStats[];
  externals: string[];
  totalSize: number;
  moduleCount: number;
}

export interface FormattedLine {
  text: string;
  hasWarning: boolean;
}

export function collectBundleStats(
  graph: DependencyGraph,
  lintResult: LintResult,
  projectRoot: string
): BundleStats {
  const modules: ModuleStats[] = [];
  const externalsSet = new Set<string>();

  for (const node of graph.modules.values()) {
    for (const req of node.requires) {
      if (!req.isLocal) {
        externalsSet.add(req.moduleName);
      }
    }
  }

  const warningsByFile = new Map<string, string[]>();

  for (const event of lintResult.moonloaderEventsInModules) {
    const warnings = warningsByFile.get(event.filePath) || [];
    warnings.push(`moonloader event '${event.eventName}'`);
    warningsByFile.set(event.filePath, warnings);
  }

  for (const unused of lintResult.unusedRequires) {
    const warnings = warningsByFile.get(unused.filePath) || [];
    warnings.push(`unused require '${unused.varName}'`);
    warningsByFile.set(unused.filePath, warnings);
  }

  for (const dup of lintResult.duplicateAssignments) {
    for (const assignment of dup.assignments) {
      const warnings = warningsByFile.get(assignment.filePath) || [];
      warnings.push(`duplicate '${dup.propertyPath}'`);
      warningsByFile.set(assignment.filePath, warnings);
    }
  }

  for (const moduleName of graph.moduleOrder) {
    const node = graph.modules.get(moduleName);
    if (!node) continue;

    modules.push({
      moduleName,
      filePath: toRelativePath(node.filePath, projectRoot),
      size: node.source.length,
      warnings: warningsByFile.get(node.filePath) || [],
    });
  }

  const totalSize = modules.reduce((sum, m) => sum + m.size, 0);

  return {
    modules,
    externals: [...externalsSet].sort(),
    totalSize,
    moduleCount: modules.length,
  };
}

function toRelativePath(filePath: string, projectRoot: string): string {
  if (filePath.startsWith(projectRoot)) {
    const relative = filePath.slice(projectRoot.length);
    return relative.startsWith('/') ? relative.slice(1) : relative;
  }
  return filePath;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}

export function formatStatsLines(stats: BundleStats): FormattedLine[] {
  const sortedModules = [...stats.modules].sort((a, b) => b.size - a.size);

  const maxPathLen = Math.min(50, Math.max(...sortedModules.map((m) => m.filePath.length)));

  return sortedModules.map((mod) => {
    const path = mod.filePath.padEnd(maxPathLen);
    const size = formatSize(mod.size).padStart(10);
    const warningCount = mod.warnings.length;
    let warning = '';
    if (warningCount === 1) {
      warning = `  \u26A0 ${mod.warnings[0]}`;
    } else if (warningCount > 1) {
      warning = `  \u26A0 ${mod.warnings[0]} (+${warningCount - 1} more)`;
    }
    return {
      text: `  ${path}${size}${warning}`,
      hasWarning: warningCount > 0,
    };
  });
}
