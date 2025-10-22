import { Command } from '@oclif/core';
import * as cmdOpts from '../core/cmd-opts';
import * as util from '../core/util';
import { Core } from '../core/core';
import * as envs from '../core/envs';

export default class Prepublish extends Command {
  static override description = 'build *.sw.json files and do other preparations for publishing';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    ...cmdOpts.GlobalFlags,
    ...cmdOpts.ForceFlag,

    ...cmdOpts.DirHashFlag,
    ...cmdOpts.VersionFlag,

    ...cmdOpts.StorageURLFlag,
    ...cmdOpts.FailExistingPackagesFlag,
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Prepublish);
    const logger = util.createLogger(flags['log-level']);

    const core = new Core(logger, { packageRoot: flags['package-root'] });
    core.buildMode = cmdOpts.modeFromFlag(flags.dev as cmdOpts.devModeName);
    core.pkgInfo.version = flags.version;
    core.fullDirHash = flags['full-dir-hash'];
    core.allPlatforms = true;

    core.buildDescriptors({
      requireAllArtifacts: true,
    });

    await core.publishPackages({
      forceReupload: flags.force,
      failExisting: flags['fail-existing-packages'],

      storageURL: flags['storage-url'],
    });

    core.publishDockerImages({ strictPlatformMatching: envs.isCI() });
  }
}
