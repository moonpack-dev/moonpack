local M = {}

function M.getName()
    return sampGetPlayerNickname(select(2, sampGetPlayerIdByCharHandle(PLAYER_PED)))
end

function M.getId()
    return select(2, sampGetPlayerIdByCharHandle(PLAYER_PED))
end

function M.getHealth()
    return getCharHealth(PLAYER_PED)
end

return M
