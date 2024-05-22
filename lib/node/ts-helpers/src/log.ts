/** Minimalistic logger facade */
export interface MiLogger {
  info(msg: string): void;

  warn(msg: string | Error): void;

  error(msg: string | Error): void;
}

export class ConsoleLoggerAdapter implements MiLogger {
  constructor(private readonly console: Console = require('console')) {
  }

  info(msg: string): void {
    this.console.log(msg);
  }

  warn(msg: string | Error): void {
    this.console.warn(msg);
  }

  error(msg: string | Error): void {
    this.console.error(msg);
  }
}
