require "./ws/wsproxy"
require "./ws/proxied"
require "./ws/error"
require "./ws/db"
require "jwt"
require "uuid"
require "cache"

macro json_record(*a)
  record {{*a}} do
    include JSON::Serializable
  end
end

module Shatter
  class WS
    VERSION = "#{{{ `shards version #{__DIR__}`.chomp.stringify }}}-#{{{ `git rev-parse --short HEAD`.chomp.stringify }}}"

    module Frame
      json_record RefreshAuth, token : String?, rtoken : UUID?
      json_record Auth, token : String
      json_record Connect, host : String, port : Int32?, listening : Array(Packet::Cb::Play), proxied : Array(Packet::Cb::Play), protocol : String
      json_record Offer, offer : String
      json_record Ready, name : String, id : String, r : UUID?, roles : Array(Bool), vers : Hash(String, UInt32)
    end

    class_getter active = [] of WS
    class_getter mc_token_cache = Cache::MemoryStore(UUID, MSA::MinecraftToken).new(expires_in: 12.hours)

    getter! con : WSProxy
    getter! mc_token : String
    getter! profile : MSA::MinecraftProfile
    getter! user : DB::User
    property abort_connection = false
    getter id : UInt32
    getter registries : {Shatter::Registry, Array(String)}
    getter ws : HTTP::WebSocket
    getter opened : Time
    @authenticating = false
    @email : String? = nil

    private def logged_send(s)
      local_log s.to_s, trace: true, passthrough: true
      @ws.send(s.to_json)
    end

    private def error(e : WSPError, *args)
      logged_send({"error" => WSPError.message(e, *args), "errno" => e.to_s})
    end

    def initialize(@ws, @id, @registries)
      local_log "New connection"
      spawn name: "ws keepalive ping #{@id}" do
        loop do
          sleep 5
          break if @ws.closed?
          @ws.ping
        end
      end
      @opened = Time.utc
      @@active << self
      # ws.on_ping { ws.pong ctx.request.path }
      @ws.on_message do |raw_message|
        local_log raw_message, trace: true
        if @mc_token.nil? && !@authenticating
          @authenticating = true

          refreshed = false
          rframe = Frame::RefreshAuth.from_json raw_message
          if rtoken = rframe.rtoken
            cached_token = @@mc_token_cache.read rtoken
            if cached_token
              @profile = Shatter::MSA.new.profile cached_token
              @mc_token = cached_token.access_token
              refreshed = true
            end
          end

          if rframe.token.nil?
            if !refreshed
              logged_send error :expired_token
              @ws.close
              next
            end
          else
            frame = Frame::Auth.new rframe.token.not_nil!
            begin
              @mc_token, @profile, shatter_token = wsp_auth frame unless refreshed
            rescue ex : Shatter::MSA::MojangAuthError::GameNotOwnedError
              logged_send error :no_ownership, @email
              @ws.close
              next
            end
          end

          db_user = DB::User.find UUID.new(profile.id)
          if db_user.nil?
            local_log "Dropping #{profile.id} (#{profile.name}) because they aren't whitelisted"
            logged_send error :not_whitelisted
            logged_send Frame::Offer.new "/rq/#{profile.name}/#{profile.id}"
            @ws.close
            next
          else
            @user = db_user
            db_user.last_known_name = profile.name
            db_user.save!
          end
          local_log "Auth as #{profile.name} successful: #{db_user.inspect}"
          servers = user.servers.to_a
          logged_send({ready: Frame::Ready.new(
            profile.name,
            profile.id,
            shatter_token,
            user.role_array.to_a,
            Packet::Protocol::PROTOCOL_NAMES
          )})
          logged_send({servers: servers.map { |s| [s.host, s.port] }})
          servers.each do |s|
            temp_proxy = WSProxy.new(UInt32::MAX, s.host, s.port, self)
            temp_proxy.ping
          end
        else
          json = JSON.parse(raw_message).as_h?
          next unless json
          if json.has_key?("su")
            next unless user.roles.superuser?
            su = json["su"].as_s
            if su == "list"
              logged_send({"su" => {
                "list" => @@active.map do |i|
                  {
                    "Shatter::WS" => {
                      "opened"     => i.opened,
                      "id"         => i.id,
                      "profile"    => i.@profile,
                      "connection" => i.con?.try { |c|
                        {"host" => "#{c.ip}:#{c.port}",
                         "state" => c.state, "listening" => c.listening,
                         "proxying" => c.proxied}
                      } || "[No connection]",
                    },
                  }
                end,
              }})
            elsif su == "knownu"
              logged_send({"su" => {
                "knownu" => DB::User.query.map do |i|
                  {
                    "id"      => i.id,
                    "name"    => i.last_known_name,
                    "roles"   => i.role_array.to_a,
                    "servers" => i.servers.map do |s|
                      {
                        "id"  => s.id,
                        "srv" => {s.host, s.port},
                      }
                    end,
                  }
                end,
              }})
            end
          elsif !@mc_token.nil? && @con.nil?
            frame = Frame::Connect.from_json raw_message
            frame_server = "#{frame.host}:#{frame.port}"
            allowed = user.servers.map { |i| "#{i.host}:#{i.port}" }
            allowed += user.allowed if user.roles.alter_list?
            unless user.roles.superuser? || allowed.includes? frame_server
              local_log "Dropping #{profile.name} because they tried to access #{frame_server}, but wasn't permitted"
              logged_send error :not_permitted
              @ws.close
              next
            end
            @con = WSProxy.new(
              Packet::Protocol::PROTOCOL_NAMES[frame.protocol]? || 0u32,
              frame.host,
              frame.port || 25565,
              frame.listening,
              frame.proxied,
              self
            )
            con.run unless abort_connection
          elsif !@con.nil?
            if json.has_key?("emulate") && json["emulate"].as_s?
              emulate = json["emulate"].as_s
              local_log "Emulate #{emulate}"
              case emulate
              when "Chat"
                structure = ChatProxy::SbStructure.from_json json["proxy"].to_json
                local_log "Proxy chat: #{structure}"
                con.packet(Packet::Sb::Play::Chat) { |pkt| ChatProxy.convert_sb structure, pkt }
              when "Disconnect"
                logged_send({"errortype" => "Disconnected", "error" => WSPError.message(WSPError::ManualDisconnect), "errno" => WSPError::ManualDisconnect.to_s})
                @ws.close
              else raise "Unknown proxy capability"
              end
            end
          end
        end
      rescue ex
        puts ex.inspect_with_backtrace
        logged_send error :connection_closed, ex
        @ws.close
        raise ex
      end
      ws.on_close { |close|
        local_log "Connection dropped (#{close})"
        abort_connection = true
        @mc_token = nil
        @con.try &.sock.try &.close
        @@active.delete self
      }
    end

    def wsp_auth(frame : Frame::Auth)
      remote_log "1/7: MSA"
      msa = Shatter::MSA.new
      remote_log "2/7: Token"
      token = msa.code frame.token
      @email = JWT.decode(token.id_token, verify: false, validate: false)[0]["email"].as_s
      remote_log "3/7: XBL"
      xbl = msa.xbl token
      remote_log "4/7: XSTS"
      xsts = msa.xsts xbl
      remote_log "5/7: Minecraft"
      mc_token = msa.minecraft xsts
      remote_log "6/7: Checking profile"
      profile = msa.profile mc_token
      shatter_refresh_token = UUID.random
      @@mc_token_cache.write(shatter_refresh_token, mc_token)
      remote_log "7/7: Checking permissions"
      {mc_token.access_token, profile, shatter_refresh_token}
    end

    def remote_log(s : String)
      local_log s, passthrough: true
      @ws.send({"log" => s}.to_json)
    end

    def local_log(s : String, trace = false, passthrough = false)
      STDOUT << id.to_s.rjust(3).colorize.yellow.bold << " "
      STDOUT << ((@profile.try &.name) || @email || "[unknown]").rjust(16).colorize.light_cyan << " "
      STDOUT << if trace && passthrough
        "]LOG[".colorize.blue
      elsif trace
        "(LOG)".colorize.blue
      elsif passthrough
        ">LOG>".colorize.red
      else
        "*LOG*".colorize.yellow.underline
      end
      s = s.colorize.dark_gray if trace
      STDOUT << " " << s << "\n"
    end

    def inspect(io : IO) : Nil
      io << {{@type.name.id.stringify}} << '('
      {% for ivar, i in @type.instance_vars %}
        {% if ivar.name != "registries" %}
          {% if i > 0 %}
            io << ", "
          {% end %}
          io << "@{{ivar.id}}="
          @{{ivar.id}}.inspect(io)
        {% end %}
      {% end %}
      io << ')'
    end
  end
end
