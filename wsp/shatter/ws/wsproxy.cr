require "shatter/connection"

module Shatter
  class WS
    class WSProxy < Shatter::Connection
      AUTO_HANDLED_PACKETS = {
        Packet::Cb::Login::CryptRequest,
        Packet::Cb::Login::LoginSuccess,
        Packet::Cb::Login::SetCompression,
        Packet::Cb::Status::Response,
        Packet::Cb::Play::KeepAlive,
        Packet::Cb::Play::JoinGame,
      }

      property ws : HTTP::WebSocket
      property id : UInt32
      property listening : Array(Packet::Cb::Play)
      property proxied : Array(Packet::Cb::Play)

      def initialize(@protocol, @ip, @port, @listening, @proxied, ws_handler)
        @registry = ws_handler.registries[0]
        @block_states = ws_handler.registries[1]
        @minecraft_token = ws_handler.mc_token
        @profile = ws_handler.profile
        @ws = ws_handler.ws
        @id = ws_handler.id
      end

      def initialize(@protocol, @ip, @port, @registry, @block_states, @minecraft_token, @profile, @ws, @id, @listening, @proxied)
      end

      private def logged_error(s)
        STDERR << connection_name << " !ERR! ".colorize.red << s.colorize.dark_gray << "\n"
        @ws.send(s)
        @ws.close message: "Closed due to above error"
      end

      private def close_from(ex : Exception)
        if ex.is_a? IO::Error
          logged_error({"errortype" => "IO error. Kicked?", "error" => "#{ex.class}. #{ex.message}"}.to_json)
        elsif ex.is_a? MSA::MojangAuthError
          logged_error({"errortype" => "Failed to authenticate", "error" => "#{ex.class}. #{ex.message}"}.to_json)
        end
        @sock.try &.close
      end

      private def read_packet
        if @ws.closed?
          @sock.try &.close
          raise "No route back to client"
        end
        size = io.read_var_int
        raise IO::EOFError.new("Packet size 0?") if size == 0
        buffer = Bytes.new size
        io.read_fully buffer
        pkt = IO::Memory.new buffer
        if @using_compression > 0
          real_size = pkt.read_var_int
          if real_size >= @using_compression
            uncompressed_buffer = Bytes.new real_size
            Compress::Zlib::Reader.new(pkt).read_fully uncompressed_buffer
            pkt = IO::Memory.new uncompressed_buffer
          end
        else
          real_size = -1
        end
        raw_packet_id = pkt.read_var_int
        packet_id = matching_cb raw_packet_id
        if AUTO_HANDLED_PACKETS.includes? packet_id
          # puts "Incoming auto-handled packet: #{@state}/#{packet_id} #{size} -> #{real_size}"
          # pkt.read_at(pkt.pos, pkt.size - pkt.pos) { |b| wide_dump(b, packet_id) }
          @ws.send({"keepalive" => @id}.to_json) if packet_id.is_a? Packet::Cb::Play && packet_id.keep_alive?
          r = Packet::PACKET_HANDLERS[packet_id].call(pkt, self)
          r.run
          STDERR << connection_name if r.has_describe?
          r.describe
          @ws.send({
            "ping"        => [@ip, @port],
            "data"        => r.data,
            "description" => Shatter::Chat::HtmlBuilder.new.read r.data["description"].as_h,
          }.to_json) if r.is_a? Packet::Status::Response
          @ws.send({
            "joingame" => r.world,
          }.to_json) if r.is_a? Packet::Play::JoinGame
        elsif @proxied.includes? packet_id
          raise "Unknown proxy capability" unless packet_id.is_a? Packet::Cb::Play
          is_silent = Packet::SILENT[packet_id]?
          pkt.read_at(pkt.pos, pkt.size - pkt.pos) { |b| wide_dump(b, packet_id, auto: false, silent: is_silent) }
          STDERR << connection_name
          packet = Packet::PACKET_HANDLERS[packet_id].call(pkt, self)
          packet.describe
          packet.run
          proxy = case packet
                  when Packet::Play::ChatMessage then WS::ChatProxy.convert_cb(packet)
                  when Packet::Play::Disconnect  then WS::DisconnectProxy.convert_cb(packet)
                  when Packet::Play::PlayInfo    then WS::PlayInfoProxy.convert_cb(packet)
                  else                                raise "Unknown proxy capability"
                  end
          json_out = {"emulate" => packet.to_s, "proxy" => proxy}
          @ws.send json_out.to_json
        elsif @listening.includes? packet_id
          pkt.read_at(pkt.pos, pkt.size - pkt.pos) { |b| wide_dump(b, packet_id, auto: false) }
          # @ws.send pkt.to_slice
        end
      end

      private def connection_name
        "#{@id.to_s.rjust(3).colorize.yellow.bold} #{@profile.name.rjust(16).colorize.light_cyan}"
      end

      # mostly stubbed
      private def wide_dump(b : IO, packet_id, out_pkt = false, unknown = false, auto = true, silent = false)
        io = b.as IO::Memory
        marker = out_pkt ? (auto ? "AToOUT>" : "WSkOUT>").colorize.green : (auto ? "ATo IN<" : "WSk IN<").colorize.red
        packet_name = packet_id.to_s.rjust(16).colorize(out_pkt ? :light_green : :red)
        marker = marker.bold if unknown
        packet_name = packet_name.bold if unknown
        prefix = "#{connection_name} #{marker}#{packet_name}|#{Shatter.hex(packet_id.to_i32).colorize.dark_gray} "
        if auto && !out_pkt && !silent
          STDERR << prefix << io.size << " bytes\n"
        elsif silent
          # pass
        else
          STDERR.puts io.to_slice.wide_hexdump(sections: 2, address: 4, prefix: prefix)
        end
      end
    end
  end
end
