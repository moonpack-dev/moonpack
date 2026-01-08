local utils = require('./utils')

local help_text = 'Use require("module") to load modules'
local help_text2 = "Or use require('module') with single quotes"
local code_example = [[
local foo = require("some.module")
]]

script_name("StringTest")

function main()
    utils.log(help_text)
    utils.log(help_text2)
    utils.log(code_example)
end
