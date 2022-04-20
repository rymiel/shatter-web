import App from "./App";
import { Incoming } from "./Frame/Incoming";
import { toByteArray } from "base64-js";
import React, { useEffect, useRef } from "react";
import { Chat } from "./chat";


interface PlayerListProps {
  app: App;
  players: Map<string, Partial<Incoming.PlayInfo.Player>>;
  renderChat : Chat.Renderer;
}

function HeadCanvas(props: {scale: number, texture: string} ) {
  const canvasRef: React.MutableRefObject<HTMLCanvasElement | null> = useRef(null);
  const size = props.scale * 8;
  useEffect(() => {
    const canvas = canvasRef.current!;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#000000';
    context.fillRect(0, 0, context.canvas.width, context.canvas.height);
    context.imageSmoothingEnabled = false;
    const image = new Image();
    image.addEventListener('load', function() {
      context.drawImage(image, 8, 8, 8, 8, 0, 0, size, size);
      context.drawImage(image, 40, 8, 8, 8, 0, 0, size, size);
    }, false);
    image.src = props.texture;
  }, [props.texture, size]);
  return <canvas ref={canvasRef} height={size} width={size} />;
}

function PlayerHead(p: {player: Partial<Incoming.PlayInfo.Player>}) {
  const properties = p.player.props;
  if (properties !== undefined) {
    const texture = JSON.parse(String.fromCharCode.apply(null, [...toByteArray(properties.textures[0])])) as Incoming.PlayInfo.Texture;
    return <HeadCanvas scale={3} texture={texture.textures.SKIN.url} />;
  } else {
    return <></>;
  }
}

export default function PlayerList(p: PlayerListProps) {
  return <div className="inline-flex" id="playerListBox">
    {[...p.players].map(([k, v]) => <p title={k} key={k} className="inline-flex mb-column">
      <PlayerHead player={v} />
      <span title={v.name} className="spl spr">{v.display_name !== undefined ? p.renderChat(v.display_name) : `${v.name}`}</span>
      <span className="atl">{`${v.ping}ms`}</span>
      </p>)}
  </div>;
}
