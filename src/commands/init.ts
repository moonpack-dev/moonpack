import { basename, join } from 'node:path';
import * as ui from '../utils/ui.ts';

export interface InitOptions {
  cwd: string;
}

const CONFIG_FILENAME = 'moonpack.json';
const LOCAL_CONFIG_FILENAME = 'moonpack.local.json';
const DEFAULT_ENTRY = 'src/main.lua';
const DEFAULT_OUT_DIR = 'dist';
const DEFAULT_VERSION = '0.1.0';

export async function initProject(options: InitOptions): Promise<void> {
  const { cwd } = options;

  const configPath = join(cwd, CONFIG_FILENAME);
  if (await Bun.file(configPath).exists()) {
    ui.error(`${CONFIG_FILENAME} already exists in this directory`);
    process.exit(1);
  }

  const defaultName = sanitizeName(basename(cwd));

  const nameInput = await ui.text({
    message: 'Project name',
    placeholder: defaultName,
    defaultValue: defaultName,
    validate: (value) => {
      if (!value.trim()) return 'Project name is required';
      if (!/^[a-z0-9-]+$/.test(value)) {
        return 'Use lowercase letters, numbers, and hyphens only';
      }
      return undefined;
    },
  });

  if (ui.isCancel(nameInput)) {
    ui.cancel('Init cancelled');
    process.exit(0);
  }

  const projectName = nameInput;

  const moonloaderPath = await ui.text({
    message: 'MoonLoader scripts path',
    placeholder: `Leave empty for ./${DEFAULT_OUT_DIR}`,
  });

  if (ui.isCancel(moonloaderPath)) {
    ui.cancel('Init cancelled');
    process.exit(0);
  }

  const outDir = (moonloaderPath || '').trim() || DEFAULT_OUT_DIR;

  const createdFiles: string[] = [];

  const config = {
    name: projectName,
    version: DEFAULT_VERSION,
    entry: DEFAULT_ENTRY,
  };

  await Bun.write(configPath, JSON.stringify(config, null, 2) + '\n');
  createdFiles.push(CONFIG_FILENAME);

  const localConfigPath = join(cwd, LOCAL_CONFIG_FILENAME);
  if (!(await Bun.file(localConfigPath).exists())) {
    const localConfig = { outDir };
    await Bun.write(localConfigPath, JSON.stringify(localConfig, null, 2) + '\n');
    createdFiles.push(LOCAL_CONFIG_FILENAME);
  }

  const gitignorePath = join(cwd, '.gitignore');
  const gitignoreEntries = [LOCAL_CONFIG_FILENAME, `${DEFAULT_OUT_DIR}/`];
  if (await Bun.file(gitignorePath).exists()) {
    const existing = await Bun.file(gitignorePath).text();
    const missing = gitignoreEntries.filter((e) => !existing.includes(e));
    if (missing.length > 0) {
      await Bun.write(gitignorePath, existing.trimEnd() + '\n' + missing.join('\n') + '\n');
      createdFiles.push('.gitignore (updated)');
    }
  } else {
    await Bun.write(gitignorePath, gitignoreEntries.join('\n') + '\n');
    createdFiles.push('.gitignore');
  }

  const entryPath = join(cwd, DEFAULT_ENTRY);
  if (!(await Bun.file(entryPath).exists())) {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(cwd, 'src'), { recursive: true });
    await Bun.write(entryPath, generateEntryTemplate(projectName));
    createdFiles.push(DEFAULT_ENTRY);
  }

  ui.success(`Created ${createdFiles.join(', ')}`);
  ui.info(`Run 'moonpack build' to bundle your project`);
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
