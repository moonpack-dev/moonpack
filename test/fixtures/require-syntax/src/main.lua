local dlstatus = require('moonloader').download_status
local font_flag = require('moonloader').font_flag

local res, imgui = pcall(require, 'mimgui')
local limgui, imgui2 = pcall(require, 'imgui')
local mLoad, monet = pcall(require, 'MoonMonet')

local res2, ti = pcall(require, 'tabler_icons')
assert(res2, 'tabler-icons required')

local memory = require'memory'
local ffi = require 'ffi'
local bit = require 'bit'

local sampev = require 'samp.events'
local sampev2 = require 'lib.samp.events'
local sf = require 'lib.sampfuncs'

local utils = require './core/utils'
local config = require './core/config'

script_name("RealWorldTest")
script_author("Test")

function main()
    if not isSampLoaded() or not isSampfuncsLoaded() then return end
    while not isSampAvailable() do wait(100) end

    while true do
        wait(0)
    end
end
