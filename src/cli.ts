#!/usr/bin/env bun
import packageJson from '../package.json';
import { build } from './commands/build.ts';
import { initProject } from './commands/init.ts';
import { watchProject } from './commands/watch.ts';
import { formatError, MoonpackError } from './utils/errors.ts';
import * as ui from './utils/ui.ts';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  if (command === '--version' || command === '-v') {
    console.log(`moonpack ${packageJson.version}`);
    process.exit(0);
  }

  if (command === 'init') {
    await runInit();
  } else if (command === 'build') {
    await runBuild();
  } else if (command === 'watch') {
    await runWatch();
  } else {
    ui.error(`Unknown command: ${command}`);
    ui.message('Run "moonpack help" for usage information.');
    process.exit(1);
  }
}

function printHelp(): void {
  ui.intro(`moonpack v${packageJson.version}`);

  ui.message('Build tool for MoonLoader Lua scripts');

  ui.note(
    [
      'init     Create a new moonpack project',
      'build    Bundle your Lua modules into one file',
      'watch    Rebuild on file changes with hot-reload',
    ].join('\n'),
    'Commands'
  );

  ui.outro('Run moonpack <command> to get started');
}

async function runBuild(): Promise<void> {
  ui.intro('moonpack build');

  try {
    const result = await build({ cwd: process.cwd() });

    if (result.success) {
      ui.outro('Build completed!');
      process.exit(0);
    } else {
      ui.outro('Build failed');
      process.exit(1);
    }
  } catch (error) {
    ui.error(formatError(error));
    if (error instanceof MoonpackError && error.details) {
      const details = error.details;
      if ('cycle' in details) {
        ui.message('Fix the circular dependency to continue.');
      }
    }
    ui.outro('Build failed');
    process.exit(1);
  }
}

async function runWatch(): Promise<void> {
  ui.intro('moonpack watch');

  try {
    await watchProject({ cwd: process.cwd() });
  } catch (error) {
    ui.error(formatError(error));
    ui.outro('Watch failed');
    process.exit(1);
  }
}

async function runInit(): Promise<void> {
  ui.intro('moonpack init');

  try {
    await initProject({ cwd: process.cwd() });
    ui.outro('Project initialized!');
  } catch (error) {
    ui.error(formatError(error));
    ui.outro('Init failed');
    process.exit(1);
  }
}

main().catch((error) => {
  ui.error(`Unexpected error: ${error}`);
  process.exit(1);
});
