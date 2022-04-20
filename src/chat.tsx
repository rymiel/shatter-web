import React from "react";

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

// NOTE: this legacy conversion isn't 100% accurate but i don't care about legacy i just don't want section signs in my strings
function convertLegacy(message: string): string | Chat.Message[] {
  const matches = message.match(LEGACY_COLOR_PATTERN);
  if (matches && matches.length > 0) {
    const parts = message.split(LEGACY_COLOR_PATTERN);
    const components: Chat.Message[] = [{text: parts[0]}];
    matches.forEach((i, j) => {
      components.push({text: parts[j+1], color: LEGACY_COLOR_LETTERS[i[1] as keyof typeof LEGACY_COLOR_LETTERS]});
    });
    return components;
  } else {
    return message;
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

// TODO: click and hover events
export function toHTML(payload: Chat.Payload, translate?: Chat.TranslationProvider, key?: number): JSX.Element {
  return toHTMLInternal(normalize(payload), translate, key);
}

function toHTMLInternal(payload: Chat.Message, translate?: Chat.TranslationProvider, key?: number): JSX.Element {
  let style = {};
  if (payload.color === undefined) {
    style = {};
  } else if (payload.color.startsWith("#")) {
    style = {color: payload.color};
  } else {
    style = {color: HTML_COLOR_MAP[payload.color as Chat.NamedColor]};
  }

  let text: JSX.Element | string = "";
  if (payload.translate) {
    const template = translate !== undefined ? (translate(payload.translate) ?? payload.translate) : payload.translate;
    const args = payload.with ?? [];
    let nextPos = 0;
    const matches = [...template.matchAll(TRANSLATION_POS)].map(i => {
      if (i[1] === undefined) {
        nextPos += 1;
        return nextPos - 1;
      } else {
        return parseInt(i[1]) - 1;
      }
    });

    const parts = template.split(TRANSLATION_POS_NO_CAPTURE);
    const components: JSX.Element[] = [<span key={0}>{parts[0]}</span>];
    matches.forEach((i, j) => {
      components.push(toHTML(args[i], translate, j + 1));
      components.push(<span key={-j - 1}>{parts[j+1]}</span>);
    });

    const unmatched = args.filter((_, i) => !matches.includes(i));

    text = <span>
      {components}
      {unmatched.map((i, j) => <React.Fragment key={j}>{j > 0 && ","}<small>{toHTML(i, translate)}</small></React.Fragment>)}
    </span>;
  } else {
    text = `${payload.text}`;
    const legacyConverted = convertLegacy(text);
    if (Array.isArray(legacyConverted)) {
      text = <span>{legacyConverted.map((i, j) => toHTMLInternal(i, translate, j))}</span>;
    }
  }
  if (payload.bold) text = <b>{text}</b>;
  if (payload.italic) text = <i>{text}</i>;
  if (payload.underlined) text = <u>{text}</u>;
  if (payload.obfuscated) text = <blink>{text}</blink>;
  if (payload.strikethrough) text = <strike>{text}</strike>;

  const children = payload.extra ?? [];

  return <span style={style} key={key}>
    {text}
    {children.map((i, j) => toHTML(i, translate, j))}
  </span>;
}

const TRANSLATION_POS = /%(?:(\d+)\$)?s/g;
const TRANSLATION_POS_NO_CAPTURE = /%(?:\d+\$)?s/g;

const HTML_COLOR_MAP = {
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

const LEGACY_COLOR_PATTERN = /§[0-9a-fk-or]/g;
const LEGACY_COLOR_LETTERS = {
  '0': "black",
  '1': "dark_blue",
  '2': "dark_green",
  '3': "dark_aqua",
  '4': "dark_red",
  '5': "dark_purple",
  '6': "gold",
  '7': "gray",
  '8': "dark_gray",
  '9': "blue",
  'a': "green",
  'b': "aqua",
  'c': "red",
  'd': "light_purple",
  'e': "yellow",
  'f': "white"
} as const;

export namespace Chat {
  export type Renderer = (message: string) => JSX.Element;
  export type TranslationProvider = (key: string) => string | undefined;
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
