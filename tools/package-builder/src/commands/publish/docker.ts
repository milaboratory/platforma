import { Command } from '@oclif/core';
import * as cmdOpts from '../../core/cmd-opts';
import * as util from '../../core/util';
import { Core } from '../../core/core';

export default class Docker extends Command {
  static override description = 'publish docker image to its registry';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    ...cmdOpts.GlobalFlags,
    ...cmdOpts.ForceFlag,

    ...cmdOpts.PackageIDFlag,
    ...cmdOpts.VersionFlag,
    ['docker-push-to']: cmdOpts.DockerFlags['docker-push-to'],

    ...cmdOpts.FailExistingPackagesFlag,
  };

  static strict: boolean = false;

  public async run(): Promise<void> {
    const { flags } = await this.parse(Docker);
    const logger = util.createLogger(flags['log-level']);

    const core = new Core(logger, { packageRoot: flags['package-root'] });
    core.pkgInfo.version = flags.version;

    core.publishDockerImages({
      ids: flags['package-id'],
      pushTo: flags['docker-push-to'],
    });
  }
}
