import { MiLogger } from '@milaboratory/ts-helpers';
import { Command } from '@oclif/core';

export class OclifLoggerAdapter implements MiLogger {
  constructor(private readonly cmd: Command) {}

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
