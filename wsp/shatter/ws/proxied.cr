require "uuid/json"
require "shatter/packet/packets"

module Shatter
  class WS
    module ChatProxy
      alias SbStructure = {chat: String}

      def self.convert_sb(s : SbStructure, pkt : IO)
        pkt.write_var_string s[:chat]
      end
    end
  end
end
