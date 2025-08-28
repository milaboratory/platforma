import { Command } from '@oclif/core';
import * as cmdOpts from '../../core/cmd-opts';
import * as util from '../../core/util';
import { Core } from '../../core/core';

export default class Packages extends Command {
  static override description = 'publish software package archive to its registry';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    ...cmdOpts.GlobalFlags,
    ...cmdOpts.ForceFlag,
    ...cmdOpts.PlatformFlags,

    ...cmdOpts.PackageIDFlag,
    ...cmdOpts.VersionFlag,

    ...cmdOpts.ArchiveFlag,
    ...cmdOpts.StorageURLFlag,
    ...cmdOpts.FailExistingPackagesFlag,
  };

  static strict: boolean = false;

  public async run(): Promise<void> {
    const { flags } = await this.parse(Packages);
    const logger = util.createLogger(flags['log-level']);

    const core = new Core(logger, { packageRoot: flags['package-root'] });
    core.pkgInfo.version = flags.version;
    core.targetPlatform = flags.platform as util.PlatformType;
    core.allPlatforms = flags['all-platforms'];

    await core.publishPackages({
      ids: flags['package-id'],
      ignoreArchiveOverlap: flags.force,

      archivePath: flags.archive,
      storageURL: flags['storage-url'],

      failExisting: flags['fail-existing-packages'],
      forceReupload: flags.force,
    });
  }
}
