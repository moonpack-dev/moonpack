import type { MoonpackConfig } from '../config/schema.ts';
import type { DependencyGraph } from './graph.ts';
import { autoLocalizeFunctions, transformRequiresToLoad } from './parser.ts';

export interface GenerateOptions {
  graph: DependencyGraph;
  config: MoonpackConfig;
  dev?: boolean;
  flatDeps?: Record<string, string>;
  hooksSource?: string;
}

/** Generates the final Lua bundle with module loader and all dependencies. */
export function generateBundle(options: GenerateOptions): string {
  const { graph, config, dev = false, flatDeps, hooksSource } = options;

  const lines: string[] = [];

  lines.push(generateHeader(config));
  lines.push('');

  const hasDeps = flatDeps && Object.keys(flatDeps).length > 0;
  if (hasDeps) {
    lines.push(generateDependencyRuntime(config, flatDeps, hooksSource));
    lines.push('');
  }

  lines.push(`local __DEV__ = ${dev}`);
  lines.push('');
  lines.push(generateModuleLoader());
  lines.push('');

  const nonEntryModules = graph.moduleOrder.filter((name) => name !== graph.entryPoint.moduleName);

  if (nonEntryModules.length > 0) {
    for (const moduleName of nonEntryModules) {
      const node = graph.modules.get(moduleName);
      if (node) {
        lines.push(generateModuleWrapper(moduleName, node.source, node.requireMappings));
        lines.push('');
      }
    }
  }

  const transformedEntrySource = transformRequiresToLoad(
    graph.entryPoint.source,
    graph.entryPoint.requireMappings
  );
  lines.push(transformedEntrySource);

  if (hasDeps) {
    lines.push('');
    lines.push(generateMainWrapper());
  }

  return lines.join('\n');
}

function generateMainWrapper(): string {
  return `local __original_main = main
function main()
    if not __mp.setup() then return end
    return __original_main()
end`;
}

function escapeLuaString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function generateHeader(config: MoonpackConfig): string {
  const versionPart = config.version ? ` v${config.version}` : '';
  const lines: string[] = [
    `-- ${config.name}${versionPart}`,
    '-- Built with moonpack',
    '',
    `script_name('${escapeLuaString(config.name)}')`,
  ];

  if (config.version) {
    lines.push(`script_version('${escapeLuaString(config.version)}')`);
  }

  if (config.author) {
    if (Array.isArray(config.author)) {
      const authors = config.author.map((a) => `'${escapeLuaString(a)}'`).join(', ');
      lines.push(`script_authors(${authors})`);
    } else {
      lines.push(`script_author('${escapeLuaString(config.author)}')`);
    }
  }

  if (config.description) {
    lines.push(`script_description('${escapeLuaString(config.description)}')`);
  }

  if (config.url) {
    lines.push(`script_url('${escapeLuaString(config.url)}')`);
  }

  return lines.join('\n');
}

function generateModuleLoader(): string {
  return `local __modules = {}
local __loaded = {}

local function __load(name)
    if __loaded[name] then return __loaded[name] end
    if __modules[name] then
        __loaded[name] = __modules[name]()
        return __loaded[name]
    end
    return require(name)
end`;
}

function generateDependencyRuntime(
  config: MoonpackConfig,
  deps: Record<string, string>,
  hooksSource?: string
): string {
  const color = config.ui?.color ?? 'FFAA00';
  const name = escapeLuaString(config.name);
  const version = config.version ? escapeLuaString(config.version) : '';

  const depsLua = Object.entries(deps)
    .map(([path, url]) => {
      return `    ["${escapeLuaString(path)}"] = "${escapeLuaString(url)}"`;
    })
    .join(',\n');

  return `----------------------------------------------------------------
-- moonpack dependency runtime
----------------------------------------------------------------
local __mp = {
    name = "${name}",
    version = "${version}",
    ui = { color = "${color}" },
    deps = {
${depsLua}
    },
    progress = { downloaded = 0, total = 0, current = nil },
    onProgress = nil,
    onConflict = nil,
    onError = nil,
    onReady = nil,
}

local __mp_ui = {}
local __mp_lfs = nil
local __mp_dlstatus = require("moonloader").download_status
local __mp_lockFile = getWorkingDirectory() .. "/lib/.moonpack_lock"
local __mp_tempDir = getWorkingDirectory() .. "/lib/.moonpack_temp"
local __mp_manifestFile = getWorkingDirectory() .. "/lib/.moonpack_manifest_" .. __mp.name:gsub("[^%w]", "_")
local __mp_MAX_CONCURRENT = 2
local __mp_LOCK_TIMEOUT_SECONDS = 30
local __mp_LOCK_POLL_MS = 100
local __mp_DOWNLOAD_CHAIN_MS = 50
local __mp_ERROR_RETRY_MS = 100
local __mp_PRE_RELOAD_MS = 500

pcall(function() __mp_lfs = require("lfs") end)

function __mp.acquireLock()
    if doesFileExist(__mp_lockFile) then
        local f = io.open(__mp_lockFile, "r")
        if f then
            local content = f:read("*a")
            f:close()
            local timestamp = tonumber(content:match("time=(%d+)"))
            if timestamp and (os.time() - timestamp) > __mp_LOCK_TIMEOUT_SECONDS then
                os.remove(__mp_lockFile)
            end
        end
    end

    while doesFileExist(__mp_lockFile) do
        wait(__mp_LOCK_POLL_MS)
    end

    __mp.createDirectoryPath(__mp_lockFile)
    local f = io.open(__mp_lockFile, "w")
    if f then
        f:write("mod=" .. __mp.name .. "\\ntime=" .. os.time())
        f:close()
    end
end

function __mp.releaseLock()
    if doesFileExist(__mp_lockFile) then
        os.remove(__mp_lockFile)
    end
end

function __mp.createDirectoryPath(filePath)
    local dir = filePath:match("(.+)[/\\\\][^/\\\\]+$")
    if dir then
        createDirectory(dir)
    end
end

function __mp.getTempPath(path)
    return __mp_tempDir .. "/" .. path:gsub("[/\\\\]", "_")
end

function __mp.copyFile(src, dst)
    local srcFile = io.open(src, "rb")
    if not srcFile then return false end
    local content = srcFile:read("*a")
    srcFile:close()

    __mp.createDirectoryPath(dst)
    local dstFile = io.open(dst, "wb")
    if not dstFile then return false end
    dstFile:write(content)
    dstFile:close()
    return true
end

function __mp.cleanupTemp()
    if __mp_lfs and doesDirectoryExist(__mp_tempDir) then
        for file in __mp_lfs.dir(__mp_tempDir) do
            if file ~= "." and file ~= ".." then
                os.remove(__mp_tempDir .. "/" .. file)
            end
        end
        __mp_lfs.rmdir(__mp_tempDir)
    end
end

function __mp.getFileSize(path)
    if __mp_lfs then
        local attr = __mp_lfs.attributes(path)
        if attr then return attr.size end
    end
    local f = io.open(path, "rb")
    if not f then return nil end
    local size = f:seek("end")
    f:close()
    return size
end

function __mp.loadManifest()
    local manifest = {}
    local f = io.open(__mp_manifestFile, "r")
    if f then
        for line in f:lines() do
            local path, size = line:match("^(.+)=(%d+)$")
            if path and size then
                manifest[path] = tonumber(size)
            end
        end
        f:close()
    end
    return manifest
end

function __mp.saveManifest(manifest)
    __mp.createDirectoryPath(__mp_manifestFile)
    local f = io.open(__mp_manifestFile, "w")
    if f then
        for path, size in pairs(manifest) do
            f:write(path .. "=" .. size .. "\\n")
        end
        f:flush()
        f:close()
    end
end

function __mp.checkDepStatus(path, manifest)
    local targetPath = getWorkingDirectory() .. "/" .. path
    if not doesFileExist(targetPath) then
        return "missing"
    end
    local currentSize = __mp.getFileSize(targetPath)
    local manifestSize = manifest[path]
    if manifestSize and currentSize == manifestSize then
        return "ok"
    end
    return "check"
end

function __mp_ui.init()
    __mp_ui.font = renderCreateFont("Arial", 10, 5)
    __mp_ui.fontSmall = renderCreateFont("Arial", 9, 0)
    __mp_ui.displayProgress = 0
end

function __mp_ui.lerp(a, b, t)
    return a + (b - a) * t
end

function __mp_ui.drawProgress()
    local resX, resY = getScreenResolution()
    local scale = resX / 1920

    local boxW, boxH = 400 * scale, 70 * scale
    local boxX = resX - boxW - 20 * scale
    local boxY = resY - boxH - 20 * scale
    local padding = 10 * scale

    renderDrawBox(boxX, boxY, boxW, boxH, 0xCC000000)
    renderFontDrawText(__mp_ui.font, "Downloading dependencies...",
        boxX + padding, boxY + padding, 0xFFFFFFFF)

    local barY = boxY + 28 * scale
    local barW = boxW - padding * 2
    local barH = 18 * scale

    local targetProgress = __mp.progress.total > 0 and (__mp.progress.downloaded / __mp.progress.total) or 0
    __mp_ui.displayProgress = __mp_ui.lerp(__mp_ui.displayProgress or 0, targetProgress, 0.1)

    renderDrawBox(boxX + padding, barY, barW, barH, 0x44FFFFFF)
    renderDrawBox(boxX + padding, barY, barW * __mp_ui.displayProgress, barH, 0xFF${color})

    local pct = math.floor(__mp_ui.displayProgress * 100) .. "%"
    renderFontDrawText(__mp_ui.font, pct,
        boxX + padding + barW/2 - 10, barY + 2, 0xFFFFFFFF)

    if __mp.progress.current then
        renderFontDrawText(__mp_ui.fontSmall, __mp.progress.current,
            boxX + padding, barY + barH + 4, 0xAAFFFFFF)
    end
end

function __mp_ui.showConflicts(conflicts)
    local VK_Y = 0x59
    local VK_N = 0x4E

    while true do
        wait(0)

        local inputActive = sampIsDialogActive() or sampIsChatInputActive()
        local resX, resY = getScreenResolution()
        local scale = resX / 1920
        local padding = 10 * scale
        local boxW = 400 * scale
        local lineH = 16 * scale
        local maxFiles = 5
        local shownFiles = math.min(#conflicts, maxFiles)
        local boxH = (70 + shownFiles * 16 + 30) * scale
        local boxX = resX - boxW - 20 * scale
        local boxY = resY - boxH - 20 * scale

        local bgAlpha = inputActive and 0x99 or 0xCC
        renderDrawBox(boxX, boxY, boxW, boxH, bgAlpha * 0x1000000)

        renderFontDrawText(__mp_ui.font, "Files need to be replaced",
            boxX + padding, boxY + padding, 0xFFFFFFFF)

        local listY = boxY + 32 * scale
        for i, c in ipairs(conflicts) do
            if i > maxFiles then
                renderFontDrawText(__mp_ui.fontSmall, "  +" .. (#conflicts - maxFiles) .. " more...",
                    boxX + padding, listY, 0xFF888888)
                break
            end
            local parts = {}
            for part in c.path:gmatch("[^/]+") do table.insert(parts, part) end
            local shortPath = #parts > 1 and (parts[#parts-1] .. "/" .. parts[#parts]) or parts[#parts] or c.path
            renderFontDrawText(__mp_ui.fontSmall, "  " .. shortPath,
                boxX + padding, listY, 0xFF${color})
            listY = listY + lineH
        end

        local btnY = boxY + boxH - 35 * scale
        local btnH = 22 * scale

        if inputActive then
            renderFontDrawText(__mp_ui.fontSmall, "Finish typing, then press Y or N",
                boxX + padding, btnY + 4 * scale, 0xFF666666)
        else
            local yBtnW = (boxW - padding * 3) / 2
            renderDrawBox(boxX + padding, btnY, yBtnW, btnH, 0xFF2d5a27)
            renderFontDrawText(__mp_ui.fontSmall, "[Y] Replace All",
                boxX + padding + yBtnW/2 - 35 * scale, btnY + 3 * scale, 0xFFFFFFFF)

            renderDrawBox(boxX + padding * 2 + yBtnW, btnY, yBtnW, btnH, 0xFF5a2727)
            renderFontDrawText(__mp_ui.fontSmall, "[N] Skip",
                boxX + padding * 2 + yBtnW + yBtnW/2 - 20 * scale, btnY + 3 * scale, 0xFFFFFFFF)
        end

        if not inputActive then
            if isKeyJustPressed(VK_Y) then
                return "replace"
            elseif isKeyJustPressed(VK_N) then
                return "skip"
            end
        end
    end
end

function __mp.downloadToTemp(path)
    local url = __mp.deps[path]
    local tempPath = __mp.getTempPath(path)
    local done = false
    local success = false

    local ok, err = pcall(downloadUrlToFile, url, tempPath, function(id, status)
        if status == __mp_dlstatus.STATUS_ENDDOWNLOADDATA then
            success = true
        end
        if status == __mp_dlstatus.STATUSEX_ENDDOWNLOAD then
            done = true
        end
    end)

    if not ok then
        if __mp.onError then __mp.onError(path, tostring(err)) end
        return false
    end

    while not done do
        wait(0)
        if not __mp.onProgress then __mp_ui.drawProgress() end
    end
    return success
end

function __mp.downloadMissing(paths, manifest)
    local pending = {}
    for _, path in ipairs(paths) do
        table.insert(pending, path)
    end

    local activeDownloads = 0
    local downloadComplete = false
    local downloadStarted = false

    local function startNextDownload()
        if activeDownloads >= __mp_MAX_CONCURRENT or #pending == 0 then
            if activeDownloads == 0 and #pending == 0 then
                downloadComplete = true
            end
            return
        end

        local path = table.remove(pending, 1)
        local url = __mp.deps[path]
        local destPath = getWorkingDirectory() .. "/" .. path

        __mp.createDirectoryPath(destPath)

        activeDownloads = activeDownloads + 1
        __mp.progress.current = path

        if __mp.onProgress then
            __mp.onProgress(__mp.progress.downloaded, __mp.progress.total, path)
        end

        local ok, err = pcall(downloadUrlToFile, url, destPath, function(id, status)
            if status == __mp_dlstatus.STATUS_ENDDOWNLOADDATA then
                downloadStarted = true
            end
            if status == __mp_dlstatus.STATUSEX_ENDDOWNLOAD then
                local size = __mp.getFileSize(destPath)
                if size then manifest[path] = size end
            end
            if status == __mp_dlstatus.STATUSEX_ENDDOWNLOAD then
                activeDownloads = activeDownloads - 1
                __mp.progress.downloaded = __mp.progress.downloaded + 1
                lua_thread.create(function()
                    wait(__mp_DOWNLOAD_CHAIN_MS)
                    startNextDownload()
                end)
            end
        end)

        if not ok then
            if __mp.onError then __mp.onError(path, tostring(err)) end
            activeDownloads = activeDownloads - 1
            table.insert(pending, path)
            lua_thread.create(function()
                wait(__mp_ERROR_RETRY_MS)
                startNextDownload()
            end)
        end
    end

    for i = 1, __mp_MAX_CONCURRENT do
        startNextDownload()
    end

    while not downloadComplete do
        wait(0)
        if downloadStarted and not __mp.onProgress then
            __mp_ui.drawProgress()
        end
    end

    __mp.progress.current = nil
    if downloadStarted and not __mp.onProgress then
        __mp_ui.drawProgress()
    end
end

function __mp.setup()
    __mp.acquireLock()

    local manifest = __mp.loadManifest()
    local toCheck = {}
    local toDownload = {}

    for path in pairs(__mp.deps) do
        local status = __mp.checkDepStatus(path, manifest)
        if status == "missing" then
            table.insert(toDownload, path)
        elseif status == "check" then
            table.insert(toCheck, path)
        end
    end

    if #toCheck == 0 and #toDownload == 0 then
        __mp.releaseLock()
        if __mp.onReady then __mp.onReady() end
        return true
    end

    __mp_ui.init()
    local installedAny = false

    local conflicts = {}
    if #toCheck > 0 then
        createDirectory(__mp_tempDir)
        __mp.progress.total = #toCheck
        __mp.progress.downloaded = 0

        for _, path in ipairs(toCheck) do
            __mp.progress.current = path
            if __mp.onProgress then
                __mp.onProgress(__mp.progress.downloaded, __mp.progress.total, path)
            end

            __mp.downloadToTemp(path)
            __mp.progress.downloaded = __mp.progress.downloaded + 1

            local tempPath = __mp.getTempPath(path)
            local targetPath = getWorkingDirectory() .. "/" .. path

            if doesFileExist(tempPath) then
                local tempSize = __mp.getFileSize(tempPath)
                local targetSize = __mp.getFileSize(targetPath)

                if tempSize and targetSize and tempSize == targetSize then
                    manifest[path] = tempSize
                    os.remove(tempPath)
                else
                    table.insert(conflicts, { path = path, tempPath = tempPath, targetPath = targetPath, tempSize = tempSize, targetSize = targetSize })
                end
            end
        end
    end

    if #conflicts > 0 then
        local choice
        if __mp.onConflict then
            choice = __mp.onConflict(conflicts)
        else
            choice = __mp_ui.showConflicts(conflicts)
        end

        if choice == "replace" then
            for _, c in ipairs(conflicts) do
                os.remove(c.targetPath)
                __mp.copyFile(c.tempPath, c.targetPath)
                manifest[c.path] = c.tempSize
                os.remove(c.tempPath)
            end
            installedAny = true
        else
            __mp.cleanupTemp()
            __mp.saveManifest(manifest)
            __mp.releaseLock()
            return false
        end
    end

    __mp.cleanupTemp()

    if #toDownload > 0 then
        __mp.progress.total = #toDownload
        __mp.progress.downloaded = 0

        __mp.downloadMissing(toDownload, manifest)
        installedAny = true
    end

    __mp.saveManifest(manifest)

    if installedAny then
        wait(__mp_PRE_RELOAD_MS)
        __mp.releaseLock()
        thisScript():reload()
    end

    __mp.releaseLock()
    if __mp.onReady then __mp.onReady() end
    return true
end

${hooksSource ? generateHooksLoader(hooksSource) : ''}`;
}

function generateHooksLoader(hooksSource: string): string {
  const indentedSource = indentCode(hooksSource.trim(), '    ');
  return `local __mp_hooks = (function()
${indentedSource}
end)()

if __mp_hooks then
    if __mp_hooks.onProgress then __mp.onProgress = __mp_hooks.onProgress end
    if __mp_hooks.onConflict then __mp.onConflict = __mp_hooks.onConflict end
    if __mp_hooks.onError then __mp.onError = __mp_hooks.onError end
    if __mp_hooks.onReady then __mp.onReady = __mp_hooks.onReady end
end

`;
}

function generateModuleWrapper(
  moduleName: string,
  source: string,
  requireMappings: Map<string, string>
): string {
  const localizedSource = autoLocalizeFunctions(source);
  const transformedSource = transformRequiresToLoad(localizedSource, requireMappings);
  const indentedSource = indentCode(transformedSource, '    ');

  return `__modules["${moduleName}"] = function()
${indentedSource}
end`;
}

function indentCode(code: string, indent: string): string {
  return code
    .split('\n')
    .map((line) => (line.length > 0 ? indent + line : line))
    .join('\n');
}
