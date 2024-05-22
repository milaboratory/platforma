// @ts-ignore
import type { Command } from '@oclif/core';
// @ts-ignore
import type { Logger } from 'winston';

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

export class OclifLoggerAdapter implements MiLogger {
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

export class WinstonLoggerAdapter implements MiLogger {
  constructor(private readonly logger: Logger) {
  }

  info(msg: string): void {
    this.logger.info(msg);
  }

  warn(msg: string | Error): void {
    this.logger.warn(msg);
  }

  error(msg: string | Error): void {
    this.logger.error(msg);
  }
}
