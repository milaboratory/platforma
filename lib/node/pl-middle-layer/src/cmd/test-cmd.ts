import { Command, Flags } from '@oclif/core';

export default class TestCmd extends Command {
  static description = 'Uploads package and refreshes the registry';

  static flags = {
    registry: Flags.string({
      char: 'r',
      summary: 'full address of the registry or alias from .pl.reg',
      helpValue: '<address|alias>',
      env: 'PL_REGISTRY'
    })
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(TestCmd);
    this.log('HI!');
  }
}
