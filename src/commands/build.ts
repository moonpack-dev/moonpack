import { dirname, isAbsolute, join } from 'node:path';
import {
  buildDependencyGraph,
  formatLintWarnings,
  generateBundle,
  lintGraph,
} from '../bundler/index.ts';
import { loadConfig } from '../config/loader.ts';
import { ensureDirectory, writeTextFile } from '../utils/fs.ts';
import type { Logger } from '../utils/logger.ts';

export interface BuildResult {
  success: boolean;
  outputPath?: string;
  error?: Error;
}

export interface BuildOptions {
  cwd: string;
  logger: Logger;
}

/** Loads moonpack.json from cwd and outputs bundled Lua to the configured outDir. */
export async function build(options: BuildOptions): Promise<BuildResult> {
  const { cwd, logger } = options;

  logger.info('Loading configuration...');
  const { config, projectRoot } = await loadConfig(cwd);

  const entryPath = join(projectRoot, config.entry);
  const sourceRoot = dirname(entryPath);

  logger.info(`Building ${config.name}...`);
  logger.info(`Entry: ${config.entry}`);

  const graph = await buildDependencyGraph({
    entryPath,
    sourceRoot,
    external: new Set(config.external),
  });

  const moduleCount = graph.modules.size;
  logger.info(`Resolved ${moduleCount} module${moduleCount === 1 ? '' : 's'}`);

  const externalModules = new Set(config.external);
  const lintResult = lintGraph(graph, externalModules);
  const warnings = formatLintWarnings(lintResult);
  for (const warning of warnings) {
    logger.warn(warning);
  }

  const bundle = generateBundle({ graph, config });

  const outDir = isAbsolute(config.outDir) ? config.outDir : join(projectRoot, config.outDir);
  await ensureDirectory(outDir);

  const outputFileName = `${config.name}.lua`;
  const outputPath = join(outDir, outputFileName);

  await writeTextFile(outputPath, bundle);

  logger.info(`Output: ${config.outDir}/${outputFileName}`);

  return { success: true, outputPath };
}
