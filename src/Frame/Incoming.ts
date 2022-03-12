import { TupleOf } from '../Util/util';

export type Roles = TupleOf<boolean, 3>;

export interface ListedConnection {
  opened: string;
  id: number;
  profile?: {
    id: string;
    name: string;
  };
  connection: {
    host: string;
    state: string;
    listening: string[];
    proxying: string[];
  } | string;
}

export interface KnownUser {
  id: string;
  name?: string;
  roles: Roles;
}

export interface UserServerList {
  servers: {
    id: number;
    srv: [string, number];
  }[];
}

export namespace Incoming {
  export interface ReadyFrame extends KnownUser {
    r?: string;
    vers: Record<string, number>
  }

  export interface ConnectionList {
    su: {
      list: {
        "Shatter::WS": ListedConnection;
      }[];
    };
  }

  export interface KnownUserList {
    su: {
      knownu: (KnownUser & UserServerList)[];
    };
  }

  export interface EmulateChatBody {
    html: string;
    position: number;
  }

  export interface EmulateDisconnectBody {
    html: string;
  }

  export namespace PlayInfo {
    export type Action = "A" | "G" | "P" | "D" | "R"
    export interface Player {
      gamemode: string;
      name: string;
      display_name: string;
      ping: string;
      props: Properties;
    }
    export interface Properties {
      textures: [string, string];
    }
    export interface Texture {
      timestamp: number;
      profileId: string;
      profileName: string;
      signatureRequired: boolean;
      textures: Record<"SKIN", TexturePayload>;
    }
    export interface TexturePayload {
      url: string;
      metadata?: { model?: string };
    }
  }

  export interface EmulatePlayInfoBody {
    type: PlayInfo.Action;
    actions: [string, Partial<PlayInfo.Player>][];
  }
}
