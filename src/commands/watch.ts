import { watch } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { loadConfig } from "../config/loader.ts";
import { formatError } from "../utils/errors.ts";
import type { Logger } from "../utils/logger.ts";
import { build } from "./build.ts";

export interface WatchOptions {
  cwd: string;
  logger: Logger;
}

/** Watches for file changes and rebuilds automatically. */
export async function watchProject(options: WatchOptions): Promise<void> {
  const { cwd, logger } = options;

  const { config, projectRoot } = await loadConfig(cwd);
  const sourceDir = dirname(join(projectRoot, config.entry));
  const outDir = isAbsolute(config.outDir) ? config.outDir : join(projectRoot, config.outDir);

  await deployReloader(outDir, config.name, logger);

  logger.info(`Watching ${sourceDir} for changes...`);
  logger.info("Press Ctrl+C to stop\n");

  await runBuild(options, logger);

  let debounce: Timer | null = null;
  const watcher = watch(sourceDir, { recursive: true }, (_event, filename) => {
    if (!filename?.endsWith(".lua")) return;

    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(async () => {
      logger.info(`\nFile changed: ${filename}`);
      await runBuild(options, logger);
    }, 100);
  });

  process.on("SIGINT", async () => {
    watcher.close();
    await cleanupReloader(outDir, config.name, logger);
    logger.info("\nStopped watching.");
    process.exit(0);
  });

  await new Promise(() => {});
}

async function runBuild(options: WatchOptions, logger: Logger): Promise<void> {
  try {
    await build({ cwd: options.cwd, logger });
  } catch (error) {
    logger.error(formatError(error));
  }
}

async function deployReloader(outDir: string, scriptName: string, logger: Logger): Promise<void> {
  const reloaderPath = join(outDir, `.${scriptName}-reloader.lua`);
  const reloaderScript = generateReloaderScript(scriptName);
  await Bun.write(reloaderPath, reloaderScript);
  logger.info(`Deployed hot-reloader: .${scriptName}-reloader.lua`);
}

async function cleanupReloader(outDir: string, scriptName: string, logger: Logger): Promise<void> {
  const reloaderPath = join(outDir, `.${scriptName}-reloader.lua`);

  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(reloaderPath).catch(() => {});
    logger.info("Cleaned up reloader");
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
