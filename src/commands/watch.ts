import { watch } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { loadConfig } from '../config/loader.ts';
import { formatError } from '../utils/errors.ts';
import * as ui from '../utils/ui.ts';
import { build } from './build.ts';

const DEFAULT_OUT_DIR = 'dist';
const DEBOUNCE_MS = 100;

export interface WatchOptions {
  cwd: string;
}

export async function watchProject(options: WatchOptions): Promise<void> {
  const { cwd } = options;
  const spinner = ui.createSpinner();

  spinner.start('Loading configuration');
  const { config, projectRoot } = await loadConfig(cwd);
  spinner.stop('Configuration loaded');

  const sourceDir = dirname(join(projectRoot, config.entry));
  const outDir = isAbsolute(config.outDir) ? config.outDir : join(projectRoot, config.outDir);

  if (config.outDir === DEFAULT_OUT_DIR) {
    ui.warn('outDir is "dist" - set your MoonLoader path in moonpack.local.json for hot-reload');
  }

  await deployReloader(outDir, config.name);

  ui.step('Running initial build');
  await runBuild(cwd);

  ui.info(`Watching ${sourceDir} for changes...\n`);

  let debounce: Timer | null = null;
  const watcher = watch(sourceDir, { recursive: true }, (_event, filename) => {
    if (!filename?.endsWith('.lua')) return;

    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(async () => {
      ui.step(`File changed: ${filename}`);
      await runBuild(cwd);
    }, DEBOUNCE_MS);
  });

  process.on('SIGINT', async () => {
    watcher.close();
    await cleanupReloader(outDir, config.name);
    ui.outro('Stopped watching');
    process.exit(0);
  });

  await new Promise(() => {});
}

async function runBuild(cwd: string): Promise<void> {
  try {
    await build({ cwd });
  } catch (error) {
    ui.error(formatError(error));
  }
}

async function deployReloader(outDir: string, scriptName: string): Promise<void> {
  const reloaderPath = join(outDir, `.${scriptName}-reloader.lua`);
  const reloaderScript = generateReloaderScript(scriptName);
  await Bun.write(reloaderPath, reloaderScript);
  ui.success(`Deployed hot-reloader: .${scriptName}-reloader.lua`);
}

async function cleanupReloader(outDir: string, scriptName: string): Promise<void> {
  const reloaderPath = join(outDir, `.${scriptName}-reloader.lua`);

  try {
    const { unlink } = await import('node:fs/promises');
    await unlink(reloaderPath).catch(() => {});
  } catch {}
}

function generateReloaderScript(scriptName: string): string {
  return `script_name(".${scriptName}-reloader")
script_description("Auto-reloads ${scriptName} when moonpack rebuilds")

local SCRIPT_NAME = "${scriptName}"
local SCRIPT_FILE = getWorkingDirectory() .. "\\\\" .. SCRIPT_NAME .. ".lua"
local CHECK_INTERVAL = 500

local lastSize = 0

function main()
    while not isSampAvailable() do wait(100) end
    lastSize = getFileSize(SCRIPT_FILE) or 0
    sampAddChatMessage("{FFAA00}[" .. SCRIPT_NAME:upper() .. "]{FFFFFF} Hot-reload active", -1)

    while true do
        wait(CHECK_INTERVAL)
        local size = getFileSize(SCRIPT_FILE)
        if size and size ~= lastSize then
            lastSize = size
            reloadScript()
        end
    end
end

function getFileSize(path)
    local f = io.open(path, "rb")
    if not f then return nil end
    local size = f:seek("end")
    f:close()
    return size
end

function reloadScript()
    for _, s in ipairs(script.list()) do
        if s.name == SCRIPT_NAME then
            s:unload()
            break
        end
    end
    wait(100)
    local ok, err = pcall(script.load, SCRIPT_FILE)
    if ok then
        sampAddChatMessage("{FFAA00}[" .. SCRIPT_NAME:upper() .. "]{00FF00} Reloaded!", -1)
    else
        sampAddChatMessage("{FFAA00}[" .. SCRIPT_NAME:upper() .. "]{FF0000} Reload failed: " .. tostring(err), -1)
    end
end
`;
}
