local code = [[
    local sampev = require 'samp.events'
    return sampev
]]
local result = loadstring(code)()

local utils = require 'core.utils'

script_name("LoadstringTest")

function main()
    while true do wait(0) end
end
