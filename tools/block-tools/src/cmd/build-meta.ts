import { Command, Flags } from '@oclif/core';
import path from 'path';
import fs from 'fs';
import { loadPackDescriptionRaw } from '../v2';
import { BlockPackMetaDescription, BlockPackMetaEmbed } from '../v2/model/block_meta';

export default class BuildMeta extends Command {
  static override description =
    'Extracts meta information from blocks package.json and outputs meta.json with embedded binary ' +
    'and textual information linked from the meta section.';

  static flags = {
    modulePath: Flags.string({
      char: 'i',
      summary: 'input module path',
      helpValue: '<path>',
      default: '.'
    }),

    destination: Flags.string({
      char: 'o',
      summary: 'output meta.json file',
      helpValue: '<path>',
      required: true
    })
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(BuildMeta);
    const modulePath = path.resolve(flags.modulePath);
    const descriptionRaw = await loadPackDescriptionRaw(modulePath);
    const metaEmbedded = await BlockPackMetaEmbed.parseAsync(
      BlockPackMetaDescription(modulePath).parse(descriptionRaw.meta)
    );

    await fs.promises.writeFile(path.resolve(flags.destination), JSON.stringify(metaEmbedded));
  }
}
