local sampev = require('lib.samp.events')
local chat = require('./features/chat')

function sampev.onServerMessage(color, text)
  print("Main handler")
end

function main()
  while true do wait(0) end
end
