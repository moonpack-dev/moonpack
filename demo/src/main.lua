local utils = require('./utils')
local player = require('./utils/player')

function main()
    utils.log('Script loaded!')

    while true do
        wait(1000)

        if isPlayerPlaying(PLAYER_HANDLE) then
            local name = player.getName()
            utils.log('Player: ' .. name)
        end
    end
end

function onScriptTerminate(script, quitGame)
    if script == thisScript() then
        utils.log('Script unloaded')
    end
end
