import { Command } from '@oclif/core';
import { createLogger } from '../../compiler/util';
import { dumpSoftware } from '../../shared/dump';
import { stdout } from 'node:process';

export default class DumpSoftware extends Command {
  static override description = 'parse sources in current package and dump all found software to stdout';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ];

  // eslint-disable-next-line @typescript-eslint/require-await
  public async run() {
    const logger = createLogger();
    dumpSoftware(logger, stdout);
  }
}
