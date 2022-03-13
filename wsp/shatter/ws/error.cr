enum Shatter::WS::WSPError
  ExpiredToken
  NotWhitelisted
  NotPermitted
  ConnectionClosed
  ManualDisconnect
  NoOwnership

  def self.message(e : WSPError, *args) : String
    case e
    in .expired_token?     then "Couldn't refresh (Token expired)"
    in .not_whitelisted?   then "You are not whitelisted to access this service"
    in .not_permitted?     then "You are not permitted to access that server using this service"
    in .connection_closed? then "Your connection to the server has been closed because of #{args[0]?.try &.class}"
    in .manual_disconnect? then "You have disconnected from this server"
    in .no_ownership?      then "Critical failure! This account (#{args[0]?}) doesn't own Minecraft: Java Edition!"
    end
  end
end
