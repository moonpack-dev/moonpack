local sampev = require('lib.samp.events')

function sampev.onServerMessage(color, text)
  -- This duplicates the handler in main.lua
  if text:find("Welcome") then
    print("Welcome!")
  end
end

return {}
