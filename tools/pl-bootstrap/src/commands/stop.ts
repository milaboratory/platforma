import { Command } from '@oclif/core';
import Core from '../core';
import * as cmdOpts from '../cmd-opts';
import * as util from '../util';

export default class Stop extends Command {
  static override description = 'Stop platforma service';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    ...cmdOpts.GlobalFlags
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Stop);

    const logger = util.createLogger(flags['log-level']);
    const core = new Core(logger);

    core.stop();
  }
}
