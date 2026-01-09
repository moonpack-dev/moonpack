import { watch } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { loadConfig } from '../config/loader.ts';
import { formatError } from '../utils/errors.ts';
import { startLogTailer, type LogEntry } from '../watch/log-tailer.ts';
import { cleanupReloader, deployReloader } from '../watch/reloader.ts';
import * as ui from '../utils/ui.ts';
import { build, type BuildIssue, type BuildResult } from './build.ts';

const DEFAULT_OUT_DIR = 'dist';
const DEBOUNCE_MS = 100;

const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const gray = (s: string) => `\x1b[90m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

function formatLogEntry(entry: LogEntry): string {
  const ts = entry.timestamp ? gray(`[${entry.timestamp}] `) : '';
  switch (entry.type) {
    case 'error':
      return `${ts}${red(`✖ ${entry.message}`)}`;
    case 'warn':
      return `${ts}${yellow(`▲ ${entry.message}`)}`;
    case 'system':
      return `${ts}${cyan(`● ${entry.message}`)}`;
    case 'script':
      return `${ts}│ ${entry.message}`;
    case 'debug':
      return `${ts}${dim(`· ${entry.message}`)}`;
  }
}

function formatIssue(issue: BuildIssue): string {
  let msg = issue.message;
  if (issue.file) {
    const loc = issue.line ? `${issue.file}:${issue.line}` : issue.file;
    msg += ` (${loc})`;
  }
  return msg;
}

export interface WatchOptions {
  cwd: string;
}

/**
 * Watches a moonpack project for changes and rebuilds automatically.
 * Deploys a hot-reloader script and tails the MoonLoader log file.
 */
export async function watchProject(options: WatchOptions): Promise<void> {
  const { cwd } = options;

  const spinner = ui.createSpinner();

  spinner.start('Loading configuration');
  const { config, projectRoot } = await loadConfig(cwd);
  spinner.stop(`Loaded: ${config.name}`);

  const entryPath = join(projectRoot, config.entry);
  const sourceDir = dirname(entryPath);
  const outDir = isAbsolute(config.outDir) ? config.outDir : join(projectRoot, config.outDir);

  if (config.outDir === DEFAULT_OUT_DIR) {
    ui.warn('outDir is "dist" — set path in moonpack.local.json for hot-reload');
  }

  spinner.start('Deploying hot-reloader');
  await deployReloader(outDir, config.name);
  spinner.stop('Hot-reloader deployed');

  spinner.start('Building');
  const result = await runBuild(cwd);
  if (result.success) {
    spinner.stop(`Built ${result.moduleCount} modules in ${result.buildTimeMs}ms`);
    for (const issue of result.issues ?? []) {
      ui.warn(formatIssue(issue));
    }
  } else {
    spinner.stop('Build failed');
    ui.error(result.error ?? 'Unknown error');
  }

  const logTailer = await startLogTailer(outDir, config.name, {
    onLogs: (entries) => {
      for (const entry of entries) {
        const formatted = formatLogEntry(entry)
          .split('\n')
          .map((line) => `│  ${line}`)
          .join('\n');
        console.log(formatted);
      }
    },
  });

  if (logTailer) {
    ui.info('Tailing moonloader.log');
  }

  ui.step(`Watching ${sourceDir}`);

  let debounce: Timer | null = null;
  const watcher = watch(sourceDir, { recursive: true }, (_event, filename) => {
    if (!filename?.endsWith('.lua')) return;

    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(async () => {
      ui.info(`Changed: ${filename}`);

      const result = await runBuild(cwd);
      if (result.success) {
        ui.step(`Built ${result.moduleCount} modules in ${result.buildTimeMs}ms`);
        for (const issue of result.issues ?? []) {
          ui.warn(formatIssue(issue));
        }
      } else {
        ui.error(result.error ?? 'Build failed');
      }
    }, DEBOUNCE_MS);
  });

  const cleanup = async () => {
    watcher.close();
    logTailer?.stop();
    await cleanupReloader(outDir, config.name);
    ui.outro('Stopped');
    process.exit(0);
  };

  process.on('SIGINT', cleanup);

  await new Promise(() => {});
}

interface RunBuildResult extends BuildResult {
  error?: string;
}

async function runBuild(cwd: string): Promise<RunBuildResult> {
  try {
    return await build({ cwd, silent: true });
  } catch (error) {
    return {
      success: false,
      error: formatError(error),
    };
  }
}
