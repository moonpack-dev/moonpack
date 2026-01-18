import { isAbsolute, join } from 'node:path';
import { loadConfig } from '../config/loader.ts';
import { downloadAllDeps, normalizeDependencies } from '../deps/index.ts';
import * as ui from '../utils/ui.ts';

export interface InstallOptions {
  cwd: string;
  silent?: boolean;
}

export interface InstallResult {
  success: boolean;
  downloaded: string[];
  errors: Array<{ path: string; error: string }>;
}

export async function install(options: InstallOptions): Promise<InstallResult> {
  const { cwd, silent } = options;
  const spinner = silent ? null : ui.createSpinner();

  spinner?.start('Loading configuration');
  const { config, projectRoot } = await loadConfig(cwd);
  spinner?.stop('Configuration loaded');

  const flatDeps = config.dependencies ? normalizeDependencies(config.dependencies) : {};

  if (Object.keys(flatDeps).length === 0) {
    if (!silent) {
      ui.info('No dependencies defined in moonpack.json');
    }
    return { success: true, downloaded: [], errors: [] };
  }

  const outDir = isAbsolute(config.outDir) ? config.outDir : join(projectRoot, config.outDir);
  const depCount = Object.keys(flatDeps).length;

  if (!silent) {
    ui.step(`Installing ${depCount} dependenc${depCount === 1 ? 'y' : 'ies'} to ${outDir}`);
  }

  spinner?.start('Downloading dependencies');

  const result = await downloadAllDeps(flatDeps, outDir, (current, total, path) => {
    spinner?.message(`Downloading (${current}/${total}): ${path}`);
  });

  spinner?.stop('Downloads complete');

  if (result.errors.length > 0) {
    for (const { path, error } of result.errors) {
      ui.error(`Failed to download ${path}: ${error}`);
    }
  }

  if (!silent) {
    if (result.downloaded.length > 0) {
      ui.success(
        `Installed ${result.downloaded.length} dependenc${result.downloaded.length === 1 ? 'y' : 'ies'}`
      );
    }
    if (result.errors.length > 0) {
      ui.warn(`${result.errors.length} download${result.errors.length === 1 ? '' : 's'} failed`);
    }
  }

  return {
    success: result.errors.length === 0,
    downloaded: result.downloaded,
    errors: result.errors,
  };
}
