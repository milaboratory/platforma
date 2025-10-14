import { Command } from '@oclif/core';
import { createLogger } from '../../compiler/util';
import { dumpArtifacts } from '../../shared/dump';
import { stdout } from 'node:process';
import type { ArtifactType } from '../../compiler/package';
import * as opts from '../../shared/basecmd';

export default class DumpArtifacts extends Command {
  static override description = 'parse sources in current package and dump all found artifacts to stdout';

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ];

  static override flags = {
    ...opts.ArtifactTypeFlag,
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(DumpArtifacts);

    const logger = createLogger();
    dumpArtifacts(
      logger, stdout,
      flags.type == 'all' ? undefined : flags.type as ArtifactType,
    );
  }
}
