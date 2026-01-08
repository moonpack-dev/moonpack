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

export interface BuildResult {
  success: boolean;
  outputPath?: string;
}

export interface BuildOptions {
  cwd: string;
}

export async function build(options: BuildOptions): Promise<BuildResult> {
  const { cwd } = options;
  const spinner = ui.createSpinner();

  spinner.start('Loading configuration');
  const { config, projectRoot } = await loadConfig(cwd);
  spinner.stop('Configuration loaded');

  const entryPath = join(projectRoot, config.entry);
  const sourceRoot = dirname(entryPath);

  spinner.start(`Building ${config.name}`);

  let graph: DependencyGraph;
  try {
    graph = await buildDependencyGraph({
      entryPath,
      sourceRoot,
      external: new Set(config.external),
    });
  } catch (error) {
    spinner.stop('Build failed');
    throw error;
  }

  const moduleCount = graph.modules.size;
  spinner.stop(`Resolved ${moduleCount} module${moduleCount === 1 ? '' : 's'}`);

  const externalModules = new Set(config.external);
  const lintResult = lintGraph(graph, externalModules);
  const warnings = formatLintWarnings(lintResult);
  for (const warning of warnings) {
    ui.warn(warning);
  }

  const bundle = generateBundle({ graph, config });

  const outDir = isAbsolute(config.outDir) ? config.outDir : join(projectRoot, config.outDir);
  await ensureDirectory(outDir);

  const outputFileName = `${config.name}.lua`;
  const outputPath = join(outDir, outputFileName);

  await writeTextFile(outputPath, bundle);

  ui.step(`Output: ${config.outDir}/${outputFileName}`);

  return { success: true, outputPath };
}
