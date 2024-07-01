/** Minimalistic logger facade */
export interface MiLogger {
  info(msg: string): void;

  warn(msg: string | any): void;

  error(msg: string | any): void;
}

export class ConsoleLoggerAdapter implements MiLogger {
  constructor(private readonly console: Console = require('console')) {
  }

  info(msg: string): void {
    this.console.log(msg);
  }

  warn(msg: string | any): void {
    this.console.warn(msg);
  }

  error(msg: string | any): void {
    this.console.error(msg);
  }
}
