enum Shatter::WS::WSPError
  ExpiredToken
  NotWhitelisted
  NotPermitted
  ConnectionClosed

  def self.message(e : WSPError, *args) : String
    case e
    in .expired_token? then "Couldn't refresh (Token expired)"
    in .not_whitelisted? then "You are not whitelisted to access this service"
    in .not_permitted? then "You are not permitted to access that server using this service"
    in .connection_closed? then "Your connection to the server has been closed because of #{args[0]?.try &.class}"
    end
  end
end
