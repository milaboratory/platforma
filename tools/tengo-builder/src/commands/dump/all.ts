import { Command } from '@oclif/core';
import { createLogger } from '../../compiler/main';
import { dumpAll } from '../../shared/dump';
import { stdout } from 'process';

export default class DumpAll extends Command {
  static override description =
    'parse sources in current package and dump all found artifacts to stdout';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  public async run(): Promise<void> {
    const logger = createLogger();
    dumpAll(logger, stdout);
  }
}
