import { Command, Flags } from '@oclif/core';
import * as cmdOpts from '../cmd-opts';
import * as util from '../util';
import * as block from '../block';

export default class CreateBlock extends Command {
  static override description = "Helps to create a new block by downloading a block's template.";

  static override examples = ['<%= name %>'];

  static override flags = {
    ...cmdOpts.GlobalFlags,
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(CreateBlock);
    const logger = util.createLogger(flags['log-level']);

    await block.createBlock(logger);
  }
}
