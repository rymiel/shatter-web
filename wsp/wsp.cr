require "shatter"
require "./shatter/ws"

class RootHandler
  include HTTP::Handler

  def call(context)
    context.request.path = "/index.html" if context.request.path == "/"
    call_next(context)
  end
end

registries = Shatter.local_registry
id = 0u32.step.cycle
ws_handler = HTTP::WebSocketHandler.new do |ws, ctx|
  ws.close unless ctx.request.path.starts_with? "/wsp"
  Shatter::WS.new(ws, id.first, registries)
end
server = HTTP::Server.new [
  ws_handler,
  RootHandler.new,
  HTTP::StaticFileHandler.new("public", directory_listing: false),
]
address = server.bind_tcp "0.0.0.0", (ENV["WSP_PORT"]? || 10110).to_i
puts "Listening on http://#{address}"
server.listen
