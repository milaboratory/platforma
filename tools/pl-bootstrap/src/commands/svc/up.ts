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

    // Before we're able to 'free' the terminal from lock of the process we start,
    // we have to provide a control over the instance state.
    // Without the control, there is no difference for the user between 'service successfully started' and 'service failed to start'
    //
    // When running service in docker, we can see the state of the service in Docker Desktop or via CLI utilities.
    // Also we see the feedback on faulty service start immediately.
    // When running service as a regular local process, the state control is comlicated.

    // When we're ready, replace all Promises magic below wit simple
    //   for (const child of children) {
    //     child.unref();
    //   }

    const results: Promise<void>[] = [];
    for (const child of children) {
      results.push(new Promise((resolve, reject) => {
        child.on('close', resolve);
        child.on('error', reject);
      }));
    }

    await Promise.all(results);
  }
}
