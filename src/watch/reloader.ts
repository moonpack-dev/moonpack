import { join } from 'node:path';

/** Deploys the hot-reloader Lua script to the output directory. */
export async function deployReloader(outDir: string, scriptName: string): Promise<void> {
  const reloaderPath = join(outDir, `.${scriptName}-reloader.lua`);
  const reloaderScript = generateReloaderScript(scriptName);
  await Bun.write(reloaderPath, reloaderScript);
}

/** Removes the hot-reloader Lua script from the output directory. */
export async function cleanupReloader(outDir: string, scriptName: string): Promise<void> {
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
    local existing = script.find(SCRIPT_NAME)
    if existing then
        existing:unload()
        while script.find(SCRIPT_NAME) do
            wait(50)
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
