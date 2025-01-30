import { Command, Args } from '@oclif/core';
import Core from '../../core';
import * as cmdOpts from '../../cmd-opts';
import * as util from '../../util';
import state from '../../state';

export default class Up extends Command {
  static override description = 'List available instances';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    ...cmdOpts.GlobalFlags,
  };

  static args = {
    name: Args.string({ required: false }),
  };

  public async run(): Promise<void> {
    const { flags, args } = await this.parse(Up);

    const logger = util.createLogger(flags['log-level']);
    const core = new Core(logger);

    const name = args.name ?? state.currentInstanceName;

    if (!name) {
      logger.error(`no pl service instance is selected. Select instance with 'select' command or provide name to 'up'`);
      process.exit(1);
    }

    const children = core.switchInstance(state.getInstanceInfo(name));
    setTimeout(() => {
      for (const child of children) {
        child.unref();
      }
    }, 1000);
  }
}
