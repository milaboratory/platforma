import { Command } from '@oclif/core';
import { createLogger } from '../../compiler/util';
import { dumpSoftware } from '../../shared/dump';
import { stdout } from 'node:process';

export default class DumpSoftware extends Command {
  static override description = 'parse sources in current package and dump all software descriptors used by templates';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ];

  public async run(): Promise<void> {
    const logger = createLogger();
    dumpSoftware(logger, stdout);
  }
}
