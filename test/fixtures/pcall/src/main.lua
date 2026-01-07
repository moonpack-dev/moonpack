local ok1, imgui = pcall(require, 'mimgui')
local ok2, mymod = pcall(require, 'mymodule')

script_name("PcallLocalTest")

function main()
    while true do wait(0) end
end
