import { Command } from '@oclif/core';
import { createLogger } from '../../compiler/util';
import { dumpSoftware } from '../../shared/dump';
import { stdout } from 'node:process';
import * as opts from '../../shared/basecmd';

export default class DumpSoftware extends Command {
  static override description = 'parse sources in current package and dump all software descriptors used by templates';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ];

  static override flags = {
    ...opts.GlobalFlags,
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(DumpSoftware);
    const logger = createLogger(flags['log-level']);
    dumpSoftware(logger, stdout);
  }
}
