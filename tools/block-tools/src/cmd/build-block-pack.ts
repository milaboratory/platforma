import { Command, Flags } from '@oclif/core';
import { loadPackDescriptionFromSource } from '../v2/source_package';
import path from 'path';
import { buildBlockPackDist } from '../v2/build_dist';

export default class BuildBlockPack extends Command {
  static description =
    'Builds block pack and outputs a block pack manifest consolidating all ' +
    'references assets into a single folder';

  static flags = {
    modulePath: Flags.string({
      char: 'i',
      summary: 'input moduloe path',
      helpValue: '<path>',
      default: '.'
    }),

    destinationPath: Flags.string({
      char: 'o',
      summary: 'output folder',
      helpValue: '<path>',
      default: './dist'
    })
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(BuildBlockPack);
    const description = await loadPackDescriptionFromSource(path.resolve(flags.modulePath));
    await buildBlockPackDist(description, path.resolve(flags.destinationPath));
  }
}
