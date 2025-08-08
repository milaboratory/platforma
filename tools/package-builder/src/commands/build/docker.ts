import { Command } from '@oclif/core';
import * as cmdOpts from '../../core/cmd-opts';
import * as util from '../../core/util';
import { Core } from '../../core/core';

export default class Docker extends Command {
  static override description = 'build docker images';

  static override flags = {
    ...cmdOpts.GlobalFlags,
    ...cmdOpts.BuildFlags,
    ...cmdOpts.VersionFlag,
    ...cmdOpts.PackageIDFlag,
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Docker);
    const logger = util.createLogger(flags['log-level']);

    const core = new Core(logger, { packageRoot: flags['package-root'] });
    core.buildMode = cmdOpts.modeFromFlag(flags.dev as cmdOpts.devModeName);

    core.pkg.version = flags.version;

    core.buildDockerImages({
      ids: flags['package-id'],
    });
  }
}
