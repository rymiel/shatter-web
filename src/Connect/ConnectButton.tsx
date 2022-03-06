import { Button, HTMLSelect, Intent } from '@blueprintjs/core';
import { ChangeEvent, useState } from 'react';
import App, { Stage } from '../App';

export interface ConnectButtonProps {
  host?: [string?, number?];
  style?: React.CSSProperties;
  app: App;
  protocols: string[];
  defaultProtocol?: string;
}

export function ConnectButton(props: ConnectButtonProps) {
  const connecting = props.app.state.stage === Stage.Connecting;
  const [protocol, setProtocol] = useState("Version");
  const onChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setProtocol(event.currentTarget.value);
  };
  const onClick = () => {
    const host = props.host;
    if (host !== undefined && host[0] !== undefined && host[1] !== undefined && !connecting)
      props.app.connect(protocol, ...host as [string, number]);
  };
  return <div style={props.style}>
    <Button text="Connect!" intent={Intent.SUCCESS} loading={connecting} onClick={onClick} />
    <HTMLSelect options={["Version", ...props.protocols]} defaultValue={props.defaultProtocol} onChange={onChange} />
  </div>;
}
