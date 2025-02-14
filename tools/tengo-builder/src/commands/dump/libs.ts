import { Command, Flags } from '@oclif/core';
import { createLogger } from '../../compiler/util';
import { dumpLibs } from '../../shared/dump';
import { stdout } from 'node:process';

export default class DumpLibs extends Command {
  static override description = 'parse sources in current package and dump all found libs to stdout';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ];

  static override flags = {
    deps: Flags.boolean({ name: 'deps', description: 'add also all libraries found in node_modules' }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(DumpLibs);

    const logger = createLogger();
    dumpLibs(logger, flags.deps, stdout);
  }
}
