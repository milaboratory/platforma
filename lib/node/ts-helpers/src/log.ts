import { EventEmitter } from 'node:events';

/** Minimalistic logger facade */
export interface MiLogger {
  info(msg: unknown): void;

  warn(msg: unknown): void;

  error(msg: unknown): void;
}

const globalConsole = console;

export class ConsoleLoggerAdapter implements MiLogger {
  constructor(private readonly console: Console = globalConsole) {}

  info(msg: unknown): void {
    this.console.log(msg);
  }

  warn(msg: unknown): void {
    this.console.warn(msg);
  }

  error(msg: unknown): void {
    this.console.error(msg);
  }
}

export type MiLoggerLevel = 'info' | 'warn' | 'error';

export type MiLoggerLogEvent = {
  level: MiLoggerLevel;
  message: string;
};

export type BlockEventDispatcherEvent =
  | {
    type: 'log';
    blockId: string;
    level: MiLoggerLevel;
    message: string;
  };

export class BlockEventDispatcher extends EventEmitter<{
  [key: string]: [BlockEventDispatcherEvent];
}> {
  constructor() {
    super();
  }

  private eventKey(blockId: string): string {
    return `${blockId}`;
  }

  public logInfo(blockId: string, message: string): void {
    this.emit(this.eventKey(blockId), { type: 'log', blockId, level: 'info', message });
  }

  public logWarn(blockId: string, message: string): void {
    this.emit(this.eventKey(blockId), { type: 'log', blockId, level: 'warn', message });
  }

  public logError(blockId: string, message: string): void {
    this.emit(this.eventKey(blockId), { type: 'log', blockId, level: 'error', message });
  }

  public onBlockEvent(blockId: string, callback: (event: BlockEventDispatcherEvent) => void): () => void {
    this.on(this.eventKey(blockId), callback);
    return () => this.off(this.eventKey(blockId), callback);
  }

  public removeAllBlockListeners(blockId: string): void {
    this.removeAllListeners(this.eventKey(blockId));
  }
}
