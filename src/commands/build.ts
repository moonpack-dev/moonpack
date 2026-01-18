import { dirname, isAbsolute, join, relative } from 'node:path';
import {
  buildDependencyGraph,
  collectBundleStats,
  type DependencyGraph,
  formatSize,
  formatStatsLines,
  generateBundle,
  lintGraph,
} from '../bundler/index.ts';
import { loadConfig } from '../config/loader.ts';
import { normalizeDependencies } from '../deps/index.ts';
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
  dev?: boolean;
}

export async function build(options: BuildOptions): Promise<BuildResult> {
  const { cwd, silent, dev = false } = options;
  const startTime = performance.now();
  const spinner = silent ? null : ui.createSpinner();

  spinner?.start('Loading configuration');
  const { config, projectRoot } = await loadConfig(cwd);
  spinner?.stop('Configuration loaded');

  const entryPath = join(projectRoot, config.entry);
  const sourceRoot = dirname(entryPath);

  const hooksPath = join(sourceRoot, 'moonpack.hooks.lua');
  const hooksFile = Bun.file(hooksPath);
  const hooksSource = (await hooksFile.exists()) ? await hooksFile.text() : undefined;

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
  const stats = collectBundleStats(graph, lintResult, projectRoot);

  const toRelative = (filePath: string) => relative(projectRoot, filePath);

  const issues: BuildIssue[] = [];
  for (const event of lintResult.moonloaderEventsInModules) {
    issues.push({
      type: 'warning',
      message: `MoonLoader event '${event.eventName}' in module has no effect`,
      file: toRelative(event.filePath),
      line: event.line,
    });
  }
  for (const dup of lintResult.duplicateAssignments) {
    issues.push({
      type: 'warning',
      message: `Duplicate assignment to '${dup.propertyPath}'`,
      file: dup.assignments[0] ? toRelative(dup.assignments[0].filePath) : undefined,
      line: dup.assignments[0]?.line,
    });
  }
  for (const unused of lintResult.unusedRequires) {
    issues.push({
      type: 'warning',
      message: `Unused require '${unused.varName}' from '${unused.moduleName}'`,
      file: toRelative(unused.filePath),
      line: unused.line,
    });
  }

  const flatDeps = config.dependencies ? normalizeDependencies(config.dependencies) : {};
  const hasDeps = Object.keys(flatDeps).length > 0;

  const bundle = generateBundle({
    graph,
    config,
    dev,
    ...(hasDeps && { flatDeps }),
    ...(hooksSource && { hooksSource }),
  });

  const outDir = isAbsolute(config.outDir) ? config.outDir : join(projectRoot, config.outDir);
  await ensureDirectory(outDir);

  const outputFileName = `${config.name}.lua`;
  const outputPath = join(outDir, outputFileName);

  await writeTextFile(outputPath, bundle);

  const buildTimeMs = Math.round(performance.now() - startTime);
  const bundleSize = Buffer.byteLength(bundle, 'utf8');

  if (!silent) {
    const lines = formatStatsLines(stats);
    const yellow = (s: string) => `\x1b[33m${s}\x1b[39m`;
    const table = lines.map((l) => (l.hasWarning ? yellow(l.text) : l.text)).join('\n');
    ui.message(table);

    if (stats.externals.length > 0) {
      ui.step(`External: ${stats.externals.join(', ')}`);
    }

    for (const mod of stats.modules) {
      for (const warning of mod.warnings) {
        ui.warn(`${mod.filePath}: ${warning}`);
      }
    }

    ui.step(
      `Output: ${config.outDir}/${outputFileName} (${formatSize(bundleSize)}, ${moduleCount} modules, ${buildTimeMs}ms)`
    );
  }

  return {
    success: true,
    outputPath,
    moduleCount,
    warningCount: issues.length,
    issues,
    buildTimeMs,
  };
}
