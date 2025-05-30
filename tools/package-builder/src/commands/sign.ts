import { Command } from '@oclif/core';
import * as cmdOpts from '../core/cmd-opts';
import * as util from '../core/util';
import { Core } from '../core/core';

export default class Sign extends Command {
  static override description = 'Sign all available build artifacts';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    ...cmdOpts.GlobalFlags,
    ...cmdOpts.PlatformFlags,

    ...cmdOpts.PackageIDFlag,
    ...cmdOpts.VersionFlag,

    ...cmdOpts.ArchiveFlag,
    ...cmdOpts.SignFlags,
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Sign);
    const logger = util.createLogger(flags['log-level']);

    const core = new Core(logger, { packageRoot: flags['package-root'] });

    core.pkg.version = flags.version;
    core.targetPlatform = flags.platform as util.PlatformType;
    core.allPlatforms = flags['all-platforms'];

    await core.signPackages({
      ids: flags['package-id'],

      archivePath: flags.archive,
      signCommand: flags['sign-command'],
    });
  }
}
