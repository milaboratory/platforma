import { Command } from '@oclif/core';
import { createLogger } from '../../compiler/util';
import { dumpTemplates } from '../../shared/dump';
import { stdout } from 'node:process';

export default class DumpTemplates extends Command {
  static override description = 'parse sources in current package and dump all found templates to stdout';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ];

  public async run(): Promise<void> {
    const logger = createLogger();
    dumpTemplates(logger, stdout);
  }
}
