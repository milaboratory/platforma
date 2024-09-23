import { Command, Flags } from '@oclif/core';
import fs from 'fs';
import path from 'path';

async function getFileContent(path: string) {
  try {
    return await fs.promises.readFile(path, 'utf8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

export default class BuildModel extends Command {
  static override description =
    'Extracts and outputs block model JSON from pre-built block model module';

  static flags = {
    modulePath: Flags.string({
      char: 'i',
      summary: 'input module path',
      helpValue: '<path>',
      default: '.'
    }),

    sourceBundle: Flags.string({
      char: 'b',
      summary: 'bundled model code to embed into the model for callback-based rendering to work',
      helpValue: '<path>',
      default: './dist/bundle.js'
    }),

    destination: Flags.string({
      char: 'o',
      summary: 'output model file',
      helpValue: '<path>',
      default: './dist/model.json'
    })
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(BuildModel);
    const modulePath = path.resolve(flags.modulePath); // i.e. folder with package.json file
    let { model, platforma } = require(modulePath);

    if (!model) model = platforma;
    if (!model) throw new Error('"model" export not found');

    const { config } = model;

    if (!config)
      throw new Error(
        'Malformed "model" object, check it is created with "BlockModel" ' +
          'and ".done()" is executed as the call in the chain.'
      );

    if (
      !('canRun' in config || 'inputsValid' in config) ||
      !('outputs' in config) ||
      !('sections' in config)
    )
      throw new Error('"config" has unexpected structure');

    const code = await getFileContent(flags.sourceBundle);
    if (code !== undefined) {
      config.code = {
        type: 'plain',
        content: code
      };
    }

    await fs.promises.writeFile(path.resolve(flags.destination), JSON.stringify(config));
  }
}
