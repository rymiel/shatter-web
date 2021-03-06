import { CSSProperties, Component, ReactElement } from 'react';

import { Button, H1, Intent } from "@blueprintjs/core";

import Auth from './Auth';
import ChatBox from './ChatBox';
import ConnectForm from './Connect/ConnectForm';
import { Incoming, KnownUser, ListedConnection, UserServerList } from './Frame/Incoming';
import { Outgoing } from './Frame/Outgoing';
import Profile from './Profile';
import ServerList, { ListedServerProps, srv } from './ServerList';
import DebugBox from './SU/DebugBox';
import ErrorC, { ErrorProps } from './Util/Error';
import Spinner from './Util/Spinner';
import PlayerList from './PlayerList';
import { Chat, toHTML } from './chat';

export const enum Stage {
  Loading, Authenticating, Joining, Connecting, Playing, Stuck, Disconnected
}
const LANG_SOURCE = "https://raw.githubusercontent.com/PrismarineJS/minecraft-data/f2fe836e5dd5826a8901bc952c755e6c7fd85eb8/data/pc/1.18/language.json";

interface AppState {
  callback: URLSearchParams;
  stage: Stage;
  errors: ErrorProps[];
  chatLines: string[];
  connections: ListedConnection[];
  knownUsers: (KnownUser & UserServerList)[];
  servers: Map<string, ListedServerProps>;
  players: Map<string, Partial<Incoming.PlayInfo.Player>>;
  ws?: WebSocket;
  loadingState?: string;
  profile?: Incoming.ReadyFrame;
  protocols?: Record<string, number>;
  translations?: Record<string, string>;
}

const WELCOME_STYLE: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  marginBottom: "1em"
};

export default class App extends Component<Record<string, never>, AppState> {
  constructor(props: Record<string, never>) {
    super(props);

    const callback = new URLSearchParams(window.location.hash.substring(1));
    window.location.hash = "";
    this.state = {
      callback,
      chatLines: [],
      connections: [],
      errors: [],
      knownUsers: [],
      players: new Map(),
      servers: new Map(),
      stage: Stage.Loading,
    };

    fetch(LANG_SOURCE).then(r => r.json()).then(d => this.setState({translations: d}));

    if (this.canAuth()) {
      let ws;
      if (process.env.WS_HOST) {
        ws = new WebSocket(`${process.env.WS_HOST}`);
      } else {
        ws = new WebSocket(`${document.location.hostname === "localhost" ? "ws" : "wss"}://${document.location.host}/wsp`);
      }
      this.state = {...this.state, ws, stage: Stage.Authenticating};
      if (callback.has("code")) ws.onopen = () => this.send({token: callback.get("code")!});
      else ws.onopen = () => this.send({rtoken: localStorage.getItem("r")!});
      ws.onmessage = (ev) => {
        const data = ev.data;
        if (typeof data === 'string') this.decodeFrame(JSON.parse(data));
      };
    }
  }

  canAuth() {
    return this.state.callback.has("code") || localStorage.getItem("r");
  }

  isShowingConnect() {
    return this.state.stage === Stage.Joining || this.state.stage === Stage.Connecting;
  }

  isShowingChat() {
    return this.state.stage === Stage.Playing || this.state.stage === Stage.Disconnected;
  }

  send(frame: Outgoing.Frame) {
    this.state.ws?.send(JSON.stringify(frame));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  decodeFrame(json: any) {
    if (json === null) return;
    if (json === undefined) return;
    if ("error" in json) {
      if (json.errno === "ExpiredToken") location.reload();
      this.setState(s => ({
        stage: s.stage === Stage.Playing ? Stage.Disconnected : s.stage,
        errors: s.errors.concat({
          name: json.errno,
          description: json.error,
          title: json.errortype ?? "Denied"
        })
      }));
      if (this.state.stage === Stage.Authenticating) {
        this.setState({stage: Stage.Stuck});
        localStorage.removeItem("r");
      }
    } else if ("log" in json) {
      const logMsg = json.log as string;
      console.log(logMsg);
      if (this.state.stage === Stage.Authenticating) {
        this.setState({loadingState: logMsg});
      }
    } else if ("emulate" in json) {
      const proxiedData = json.proxy;
      if (json.emulate === "Chat") {
        const data = proxiedData as Incoming.EmulateChatBody;
        if (data.position !== 2) {
          const chatLine = data.message.replace(/\n/, "<br/>");
          this.setState(s => ({chatLines: [...s.chatLines, chatLine]}));
        }
      } else if (json.emulate === "PlayInfo") {
        const data = proxiedData as Incoming.EmulatePlayInfoBody;
        const type = data.action_id;
        this.setState(s => {
          const players = s.players;
          data.actions.forEach(i => {
            if (type === Incoming.PlayInfo.Action.Add) {
              players.set(i[0], i[1]);
            } else if (type === Incoming.PlayInfo.Action.Remove) {
              players.delete(i[0]);
            } else {
              const existing = players.get(i[0]) ?? {};
              players.set(i[0], {...existing, ...i[1]});
            }
          });
          return {players};
        });
      } else if (json.emulate === "Disconnect") {
        const data = proxiedData as Incoming.EmulateDisconnectBody;
        this.setState(s => ({
          stage: Stage.Disconnected,
          errors: [...s.errors, {
            name: "ForcedDisconnect",
            title: "Forced Disconnect",
            description: (<span>{ this.renderChat(data.message) }</span>)
          }]
        }));
      } else {
        console.log(`Unhandled proxy ${json.emulate}`);
        console.log(proxiedData);
      }
    } else if ("ready" in json) {
      let frame = json.ready as Incoming.ReadyFrame;
      if (frame.r) localStorage.setItem("r", frame.r);
      this.setState({stage: Stage.Joining, profile: frame, protocols: frame.vers});
    } else if ("servers" in json) {
      let frame = json.servers as [string, number][];
      this.setState(s => {
        const servers = s.servers;
        frame.forEach((e) => servers.set(srv(e), {host: e}));
        return {servers};
      });
    } else if ("joingame" in json) {
      if (this.state.stage === Stage.Connecting) this.setState({stage: Stage.Playing});
    } else if ("ping" in json) {
      const server = json.ping as [string, number];
      const favicon = json.data.favicon as string;
      // meh
      const description = this.renderChat(JSON.stringify(json.data.description));
      const protocolVersion = json.data.version.protocol as number;

      this.setState(s => {
        const servers = s.servers;
        const indexedServer = servers.get(srv(server));
        if (indexedServer === undefined) return {servers};

        indexedServer.favicon = favicon;
        indexedServer.description = description;
        const protocols = s.protocols;
        if (protocols) {
          indexedServer.defaultVersion = Object.keys(protocols).find(key => protocols[key] === protocolVersion);
        }
        return {servers};
      });
    } else if ("su" in json) {
      const su = json.su;
      if ("list" in su) {
        this.setState({connections: (json as Incoming.ConnectionList).su.list.map(i => i['Shatter::WS'])});
      } else if ("knownu" in su) {
        this.setState({knownUsers: (json as Incoming.KnownUserList).su.knownu});
      } else {
        console.log(`Unhandled su action`);
        console.log(su);
      }
    } else {
      console.log("Unhandled frame");
      console.log(json);
    }
  }

  connect(protocol: string, host: string, port: number) {
    const protocols = this.state.protocols;
    if (!protocols) return;
    this.send({
      host,
      listening: [],
      port,
      proxied: ["Chat", "Disconnect", "PlayInfo"],
      protocol: ((protocol in protocols) ? protocol : Object.keys(protocols)[0])
    });
    this.setState({stage: Stage.Connecting});
  }

  // TODO: This might have poor performance as it re-renders every line every time a line is appended
  renderChat(msg: string): ReactElement {
    const obj = JSON.parse(msg) as Chat.Payload;
    return toHTML(obj, (i => this.state.translations?.[i]));
  }

  render() {
    return <>
      <H1 title={process.env.SHATTER_VERSION}>Shatter Web</H1>
      {this.state.errors.map((p, i) => <ErrorC key={i} {...p} />)}
      {!this.canAuth() && <Auth />}
      {this.state.stage === Stage.Authenticating && <Spinner text={this.state.loadingState} />}
      {this.isShowingConnect() && this.state.profile && <div style={WELCOME_STYLE}><span>Welcome, </span><Profile profile={this.state.profile} /></div>}
      {this.isShowingConnect() && <>
        <ServerList app={this} servers={this.state.servers} />
        <ConnectForm app={this} />
      </>}
      {this.state.stage === Stage.Playing && <PlayerList app={this} players={this.state.players} renderChat={this.renderChat.bind(this)} />}
      {this.isShowingChat() && <ChatBox sendFrame={this.send.bind(this)} chatLines={this.state.chatLines} renderChat={this.renderChat.bind(this)} minimal={this.state.stage === Stage.Disconnected} />}
      {this.state.profile && this.state.profile.roles[1] && <DebugBox app={this} />}
      <div style={{position: "absolute", "top": 0, "right": 0}}>
        {this.state.stage === Stage.Playing && <Button text="Disconnect" intent={Intent.DANGER} onClick={() => this.send({emulate: "Disconnect"})} />}
        {this.state.stage === Stage.Disconnected && <Button text="Back to server list" intent={Intent.WARNING} onClick={() => location.reload()} />}
      </div>
    </>;
  }
}
