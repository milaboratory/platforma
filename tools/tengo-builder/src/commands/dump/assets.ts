import { Command } from '@oclif/core';
import { createLogger } from '../../compiler/util';
import { dumpAssets } from '../../shared/dump';
import { stdout } from 'node:process';

export default class DumpAssets extends Command {
  static override description = 'parse sources in current package and dump all found assets to stdout';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ];

  public run(): void {
    const logger = createLogger();
    dumpAssets(logger, stdout);
  }
}
