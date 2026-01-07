import { basename, join } from 'node:path';
import type { Logger } from '../utils/logger.ts';

export interface InitOptions {
  cwd: string;
  logger: Logger;
}

const CONFIG_FILENAME = 'moonpack.json';
const DEFAULT_ENTRY = 'src/main.lua';

/** Initializes a new moonpack project with config files and entry point. */
export async function initProject(options: InitOptions): Promise<void> {
  const { cwd, logger } = options;

  const configPath = join(cwd, CONFIG_FILENAME);
  if (await Bun.file(configPath).exists()) {
    logger.error(`${CONFIG_FILENAME} already exists`);
    process.exit(1);
  }

  const projectName = sanitizeName(basename(cwd));

  const config = {
    name: projectName,
    version: '0.1.0',
    entry: DEFAULT_ENTRY,
    external: ['samp.events', 'mimgui', 'imgui'],
  };

  await Bun.write(configPath, JSON.stringify(config, null, 2) + '\n');
  logger.info(`Created ${CONFIG_FILENAME}`);

  const localConfigPath = join(cwd, 'moonpack.local.json');
  if (!(await Bun.file(localConfigPath).exists())) {
    const localConfig = { outDir: 'dist' };
    await Bun.write(localConfigPath, JSON.stringify(localConfig, null, 2) + '\n');
    logger.info('Created moonpack.local.json');
  }

  const gitignorePath = join(cwd, '.gitignore');
  const gitignoreEntries = ['moonpack.local.json', 'dist/'];
  if (await Bun.file(gitignorePath).exists()) {
    const existing = await Bun.file(gitignorePath).text();
    const missing = gitignoreEntries.filter((e) => !existing.includes(e));
    if (missing.length > 0) {
      await Bun.write(gitignorePath, existing.trimEnd() + '\n' + missing.join('\n') + '\n');
      logger.info('Updated .gitignore');
    }
  } else {
    await Bun.write(gitignorePath, gitignoreEntries.join('\n') + '\n');
    logger.info('Created .gitignore');
  }

  const entryPath = join(cwd, DEFAULT_ENTRY);
  if (!(await Bun.file(entryPath).exists())) {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(cwd, 'src'), { recursive: true });
    await Bun.write(entryPath, generateEntryTemplate(projectName));
    logger.info(`Created ${DEFAULT_ENTRY}`);
  }

  logger.info('\nRun `moonpack build` to bundle your project');
}

function sanitizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

function generateEntryTemplate(name: string): string {
  return `script_name('${name}')
script_author('')

function main()
    if not isSampLoaded() or not isSampfuncsLoaded() then return end
    while not isSampAvailable() do wait(100) end

    sampAddChatMessage('${name} loaded', -1)

    while true do
        wait(0)
    end
end
`;
}
