declare global {
  namespace JSX {
    interface IntrinsicElements {
      blink: unknown;
      strike: unknown;
    }
  }
}

function normalize(payload: Chat.Payload): Chat.Message {
  if (typeof payload === "string") {
    return { text: payload };
  } else if (Array.isArray(payload)) {
    const [parent, ...children] = payload;
    return {
      ...parent,
      extra: [...(parent.extra ?? []), ...children],
    };
  } else {
    return payload;
  }
}

export function toPlainText(payload: Chat.Payload): string {
  return toPlainTextInternal(normalize(payload));
}

function toPlainTextInternal(message: Chat.Message): string {
  let childrenString = "";
  if (message.extra) {
    childrenString = message.extra.map((i) => toPlainText(i)).join("");
  }
  return (message.text ?? "") + childrenString;
}

export function toHTML(payload: Chat.Payload, key?: number): JSX.Element {
  return toHTMLInternal(normalize(payload), key);
}

function toHTMLInternal(payload: Chat.Message, key?: number): JSX.Element {
  let style = {};
  if (payload.color === undefined) {
    style = {};
  } else if (payload.color.startsWith("#")) {
    style = {color: payload.color};
  } else {
    style = {color: HTMLChat.HTML_COLOR_MAP[payload.color as Chat.NamedColor]};
  }

  let text: JSX.Element | string = `${payload.text}`;
  if (payload.bold) text = <b>{text}</b>;
  if (payload.italic) text = <i>{text}</i>;
  if (payload.underlined) text = <u>{text}</u>;
  if (payload.obfuscated) text = <blink>{text}</blink>;
  // if (payload.special) text = <small>{text}</small>;
  if (payload.strikethrough) text = <strike>{text}</strike>;

  const children = payload.extra ?? [];

  return <span style={style} key={key}>
    {text}
    {children.map((i, j) => toHTML(i, j))}
  </span>;
}

namespace HTMLChat {
  export const HTML_COLOR_MAP = {
    black: "#000000",
    dark_blue: "#0000AA",
    dark_green: "#00AA00",
    dark_aqua: "#00AAAA",
    dark_red: "#AA0000",
    dark_purple: "#AA00AA",
    gold: "#FFAA00",
    gray: "#AAAAAA",
    dark_gray: "#555555",
    blue: "#5555FF",
    green: "#55FF55",
    aqua: "#55FFFF",
    red: "#FF5555",
    light_purple: "#FF55FF",
    yellow: "#FFFF55",
    white: "#FFFFFF",
  } as const;
}

export namespace Chat {
  export type Renderer = (message: string) => JSX.Element;
  export interface Message {
    text?: string;
    translate?: string;
    with?: Payload[];
    extra?: Payload[];

    color?: Color;
    font?: string;

    bold?: boolean;
    italic?: boolean;
    underlined?: boolean;
    strikethrough?: boolean;
    obfuscated?: boolean;

    insertion?: string;
    clickEvent?: ClickEvent;
    hoverEvent?: HoverEvent;
  }

  interface ClickEvent {
    action: ClickEventAction;
    value: string;
  }

  type HoverEvent = TextHoverEvent | EntityHoverEvent | ItemHoverEvent;

  interface TextHoverEvent {
    action: "show_text";
    contents: Payload;
  }

  interface ItemHoverEvent {
    action: "show_item";
    contents: ItemHoverEventPayload;
  }

  interface ItemHoverEventPayload {
    id: string;
    count?: number;
    // tag?: any;
  }

  interface EntityHoverEvent {
    action: "show_entity";
    contents: EntityHoverEventPayload;
  }

  interface EntityHoverEventPayload {
    name?: Payload;
    type: string;
    id: string;
  }

  export type ClickEventAction =
    | "open_url"
    | "open_file"
    | "run_command"
    | "suggest_command"
    | "change_page"
    | "copy_to_clipboard";

  type HexColor = `#${string}`;
  export type NamedColor =
    | "black"
    | "dark_blue"
    | "dark_green"
    | "dark_aqua"
    | "dark_red"
    | "dark_purple"
    | "gold"
    | "gray"
    | "dark_gray"
    | "blue"
    | "green"
    | "aqua"
    | "red"
    | "light_purple"
    | "yellow"
    | "white";
  export type Color = HexColor | NamedColor;

  export type Payload = Message | Message[] | string;
}
