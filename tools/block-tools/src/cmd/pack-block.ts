import { Command, Flags } from '@oclif/core';
import { loadPackDescription } from '../v2/source_package';
import path from 'path';
import { buildBlockPackDist } from '../v2/build_dist';

export default class PackBlock extends Command {
  static description =
    'Builds block pack and outputs a block pack manifest consolidating all ' +
    'references assets into a single folder';

  static flags = {
    modulePath: Flags.string({
      char: 'i',
      summary: 'input module path',
      helpValue: '<path>',
      default: '.'
    }),

    destinationPath: Flags.string({
      char: 'o',
      summary: 'output folder',
      helpValue: '<path>',
      default: './block-pack'
    })
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(PackBlock);
    const description = await loadPackDescription(path.resolve(flags.modulePath));
    await buildBlockPackDist(description, path.resolve(flags.destinationPath));
  }
}
