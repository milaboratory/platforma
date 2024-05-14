import { Command } from '@oclif/core/lib/command';

export interface PlLogger {
  info(msg: string): void;

  warn(msg: string | Error): void;

  error(msg: string | Error): void;
}

export class CmdLoggerAdapter implements PlLogger {
  constructor(private readonly cmd: Command) {
  }

  info(msg: string): void {
    this.cmd.log(msg);
  }

  warn(msg: string | Error): void {
    this.cmd.warn(msg);
  }

  error(msg: string | Error): void {
    this.cmd.error(msg);
  }
}

export class TestLogger implements PlLogger {
  constructor(private readonly console: Console = require('console')) {
  }

  error(msg: string | Error): void {
    this.console.error(msg);
  }

  info(msg: string): void {
    this.console.log(msg);
  }

  warn(msg: string | Error): void {
    this.console.warn(msg);
  }
}
