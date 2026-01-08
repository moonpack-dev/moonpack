local M = {}

function log(msg)
    print("[LOG] " .. msg)
end

function greet(name)
    log("Hello, " .. name)
end

function M.log(msg)
    log(msg)
end

function M.greet(name)
    greet(name)
end

return M
