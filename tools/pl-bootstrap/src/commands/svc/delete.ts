import { Command, Args, Flags } from '@oclif/core';
import Core from '../../core';
import * as cmdOpts from '../../cmd-opts';
import * as util from '../../util';

export default class Delete extends Command {
  static override description = 'List available instances';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    ...cmdOpts.GlobalFlags,

    all: Flags.boolean({
      description: 'remove all known instances',
      required: false,
    }),
  };

  static args = {
    name: Args.string({ required: false }),
  };

  public async run(): Promise<void> {
    const { flags, args } = await this.parse(Delete);

    const logger = util.createLogger(flags['log-level']);
    const core = new Core(logger);

    const name = args.name;
    const all = flags.all;

    if (all) {
      core.cleanupInstance();
      process.exit(0);
    }

    if (!name) {
      logger.error(`Please, specify name of instance to be removed or set '--all' flag instead`);
      process.exit(1);
    }

    core.cleanupInstance(name);
  }
}
