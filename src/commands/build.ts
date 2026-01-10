import { dirname, isAbsolute, join } from 'node:path';
import {
  buildDependencyGraph,
  type DependencyGraph,
  formatLintWarnings,
  generateBundle,
  lintGraph,
} from '../bundler/index.ts';
import { loadConfig } from '../config/loader.ts';
import { ensureDirectory, writeTextFile } from '../utils/fs.ts';
import * as ui from '../utils/ui.ts';

export interface BuildIssue {
  type: 'error' | 'warning';
  message: string;
  file?: string | undefined;
  line?: number | undefined;
}

export interface BuildResult {
  success: boolean;
  outputPath?: string;
  moduleCount?: number;
  warningCount?: number;
  issues?: BuildIssue[];
  buildTimeMs?: number;
}

export interface BuildOptions {
  cwd: string;
  silent?: boolean;
}

export async function build(options: BuildOptions): Promise<BuildResult> {
  const { cwd, silent } = options;
  const startTime = performance.now();
  const spinner = silent ? null : ui.createSpinner();

  spinner?.start('Loading configuration');
  const { config, projectRoot } = await loadConfig(cwd);
  spinner?.stop('Configuration loaded');

  const entryPath = join(projectRoot, config.entry);
  const sourceRoot = dirname(entryPath);

  spinner?.start(`Building ${config.name}`);

  let graph: DependencyGraph;
  try {
    graph = await buildDependencyGraph({
      entryPath,
      sourceRoot,
    });
  } catch (error) {
    spinner?.stop('Build failed');
    throw error;
  }

  const moduleCount = graph.modules.size;
  spinner?.stop(`Resolved ${moduleCount} module${moduleCount === 1 ? '' : 's'}`);

  const lintResult = lintGraph(graph);
  const warnings = formatLintWarnings(lintResult);
  if (!silent) {
    for (const warning of warnings) {
      ui.warn(warning);
    }
  }

  const issues: BuildIssue[] = [];
  for (const event of lintResult.moonloaderEventsInModules) {
    issues.push({
      type: 'warning',
      message: `MoonLoader event '${event.eventName}' in module has no effect`,
      file: event.filePath,
      line: event.line,
    });
  }
  for (const dup of lintResult.duplicateAssignments) {
    issues.push({
      type: 'warning',
      message: `Duplicate assignment to '${dup.propertyPath}'`,
      file: dup.assignments[0]?.filePath,
      line: dup.assignments[0]?.line,
    });
  }
  for (const unused of lintResult.unusedRequires) {
    issues.push({
      type: 'warning',
      message: `Unused require '${unused.varName}' from '${unused.moduleName}'`,
      file: unused.filePath,
      line: unused.line,
    });
  }

  const bundle = generateBundle({ graph, config });

  const outDir = isAbsolute(config.outDir) ? config.outDir : join(projectRoot, config.outDir);
  await ensureDirectory(outDir);

  const outputFileName = `${config.name}.lua`;
  const outputPath = join(outDir, outputFileName);

  await writeTextFile(outputPath, bundle);

  if (!silent) {
    ui.step(`Output: ${config.outDir}/${outputFileName}`);
  }

  const buildTimeMs = Math.round(performance.now() - startTime);

  return {
    success: true,
    outputPath,
    moduleCount,
    warningCount: issues.length,
    issues,
    buildTimeMs,
  };
}
