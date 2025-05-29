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

export type BlockModelLogEvent = MiLoggerLogEvent & {
  blockId: string;
};

export class BlockModelLogDispatcher extends EventEmitter<{
  log: [BlockModelLogEvent];
}> {
  constructor(private readonly logger: MiLogger) {
    super();
  }

  public emit(eventName: 'log', ...args: [BlockModelLogEvent]): boolean {
    const [event] = args;
    switch (event.level) {
      case 'info':
        this.logger.info(event.message);
        break;
      case 'warn':
        this.logger.warn(event.message);
        break;
      case 'error':
        this.logger.error(event.message);
        break;
    }
    return super.emit(eventName, ...args);
  }

  public logInfo(blockId: string, message: string): void {
    this.emit('log', { blockId, level: 'info', message });
  }

  public logWarn(blockId: string, message: string): void {
    this.emit('log', { blockId, level: 'warn', message });
  }

  public logError(blockId: string, message: string): void {
    this.emit('log', { blockId, level: 'error', message });
  }
}
