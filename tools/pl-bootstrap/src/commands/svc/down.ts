import { Command, Args } from '@oclif/core';
import Core from '../../core';
import * as cmdOpts from '../../cmd-opts';
import * as util from '../../util';
import state from '../../state';

export default class Down extends Command {
  static override description = 'List available instances';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    ...cmdOpts.GlobalFlags,
  };

  static args = {
    name: Args.string({ required: false }),
  };

  public async run(): Promise<void> {
    const { flags, args } = await this.parse(Down);

    const logger = util.createLogger(flags['log-level']);
    const core = new Core(logger);

    const name = args.name ?? state.currentInstanceName;

    if (!name) {
      logger.info(`no pl service instance selected. No service was stopped`);
      process.exit(0);
    }

    core.stopInstance(state.getInstanceInfo(name));
  }
}
