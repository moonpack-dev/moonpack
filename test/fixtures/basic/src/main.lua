local utils = require('./core/utils')
local constants = require('./core/constants')
local sampev = require('lib.samp.events')

script_name("TestMod")
script_author("Developer")

function main()
    utils.log("Mod loaded!")
    utils.log("Version: " .. constants.VERSION)

    while true do
        wait(0)
    end
end

function onScriptTerminate(script, quitGame)
    if script == thisScript() then
        utils.log("Mod unloaded")
    end
end
