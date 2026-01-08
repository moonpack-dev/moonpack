local helpers = require("helpers")
local sampev = require("lib.samp.events")

function main()
    helpers.greet("World")
end

function onScriptTerminate(script, quitGame)
    if script == thisScript() then
        helpers.log("Goodbye")
    end
end

function sampev.onServerMessage(color, text)
    helpers.log(text)
    return true
end
