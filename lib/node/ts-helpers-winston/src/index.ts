import type { MiLogger } from '@milaboratories/ts-helpers';
import type { Logger } from 'winston';

export class WinstonLoggerAdapter implements MiLogger {
  constructor(private readonly logger: Logger) {}

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
