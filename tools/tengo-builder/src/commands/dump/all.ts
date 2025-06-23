import { Command } from '@oclif/core';
import { createLogger } from '../../compiler/util';
import { dumpAll } from '../../shared/dump';
import { stdout } from 'node:process';

export default class DumpAll extends Command {
  static override description = 'parse sources in current package and dump all found artifacts to stdout';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ];

  // eslint-disable-next-line @typescript-eslint/require-await
  public async run() {
    const logger = createLogger();
    dumpAll(logger, stdout);
  }
}
