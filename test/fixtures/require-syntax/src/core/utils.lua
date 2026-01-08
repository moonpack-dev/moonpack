local config = require './config'

local M = {}

function M.formatMessage(msg)
    return "{FFFFFF}" .. msg
end

function M.getVersionString()
    return "v" .. config.version
end

return M
