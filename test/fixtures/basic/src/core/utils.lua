local constants = require("core.constants")

local M = {}

function M.log(message)
    print("[" .. constants.MOD_TAG .. "] " .. message)
end

function M.formatTime(seconds)
    local mins = math.floor(seconds / 60)
    local secs = seconds % 60
    return string.format("%02d:%02d", mins, secs)
end

return M
