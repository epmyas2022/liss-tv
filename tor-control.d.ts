declare module "tor-control" {
  export interface TorControlOptions {
    host?: string;
    port?: number;
    password?: string;
    persistent?: boolean;
  }

  export interface TorControlStatus {
    code: number;
    messages: string[];
  }

  export type TorControlCallback = (
    err: Error | null,
    status: TorControlStatus,
  ) => void;

  export type TorSignal =
    | "RELOAD"
    | "SHUTDOWN"
    | "DUMP"
    | "DEBUG"
    | "HALT"
    | "NEWNYM"
    | "CLEARDNSCACHE"
    | "HEARTBEAT"
    | "ACTIVE"
    | "DORMANT";

  class TorControl {
    constructor(options?: TorControlOptions);

    authenticate(callback: TorControlCallback): void;

    signal(signalName: TorSignal, callback: TorControlCallback): void;

    signalNewnym(callback: TorControlCallback): void;

    getInfo(keywords: string[], callback: TorControlCallback): void;

    sendCommand(command: string, callback: TorControlCallback): void;
  }

  export default TorControl;
}
