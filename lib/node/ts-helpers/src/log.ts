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
