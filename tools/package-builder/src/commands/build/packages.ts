import { Command } from '@oclif/core';
import * as cmdOpts from '../../core/cmd-opts';
import * as util from '../../core/util';
import { Core } from '../../core/core';

export default class Packages extends Command {
  static override description
    = 'Pack software into platforma package (.tgz archive for binary registry)';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    ...cmdOpts.GlobalFlags,
    ...cmdOpts.BuildFlags,
    ...cmdOpts.PlatformFlags,

    ...cmdOpts.VersionFlag,
    ...cmdOpts.ArchiveFlag,
    ...cmdOpts.ContentRootFlag,
    ...cmdOpts.PackageIDFlag,
    ...cmdOpts.DirHashFlag,
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Packages);
    const logger = util.createLogger(flags['log-level']);

    const core = new Core(logger);

    core.pkg.version = flags.version;
    core.buildMode = cmdOpts.modeFromFlag(flags.dev as cmdOpts.devModeName);
    core.targetPlatform = flags.platform as util.PlatformType;
    core.allPlatforms = flags['all-platforms'];
    core.fullDirHash = flags['full-dir-hash'];

    await core.buildPackages({
      ids: flags['package-id'],
      forceBuild: flags.force as boolean,

      archivePath: flags.archive,
      contentRoot: flags['content-root'],
      skipIfEmpty: flags['package-id'] ? false : true, // do not skip 'non-binary' packages if their IDs were set as args
    });
  }
}
