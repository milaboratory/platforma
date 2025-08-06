import { Command } from '@oclif/core';
import * as cmdOpts from '../../core/cmd-opts';
import * as util from '../../core/util';
import { Core } from '../../core/core';

export default class BuildAll extends Command {
  static override description
    = 'Build all targets (entrypoint descriptors, binary pacakges and so on)';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    ...cmdOpts.GlobalFlags,
    ...cmdOpts.ForceFlag,

    ...cmdOpts.BuildFlags,
    ...cmdOpts.PlatformFlags,
    ...cmdOpts.VersionFlag,

    ...cmdOpts.EntrypointNameFlag,
    ...cmdOpts.PackageIDFlag,
    ...cmdOpts.DirHashFlag,

    ...cmdOpts.ArchiveFlag,
    ...cmdOpts.ContentRootFlag,
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(BuildAll);
    const logger = util.createLogger(flags['log-level']);


    try {
      const core = new Core(logger, { packageRoot: flags['package-root'] });

      core.buildMode = cmdOpts.modeFromFlag(flags.dev as cmdOpts.devModeName);
      core.pkg.version = flags.version;
      core.targetPlatform = flags.platform as util.PlatformType;
      core.allPlatforms = flags['all-platforms'];
      core.fullDirHash = flags['full-dir-hash'];

      core.buildDescriptors({
        packageIds: flags['package-id'] ? flags['package-id'] : undefined,
        entrypoints: flags.entrypoint ? flags.entrypoint : undefined,
        sources: flags.source ? (flags.source as util.SoftwareSource[]) : undefined,
      });

      await core.buildPackages({
        ids: flags['package-id'],
        forceBuild: flags.force,

        archivePath: flags.archive,
        contentRoot: flags['content-root'],
        skipIfEmpty: flags['package-id'] ? false : true, // do not skip 'non-binary' packages if their IDs were set as args
      });
    } catch (e) {
      logger.debug(e);
      if (e instanceof Error) {
        logger.debug(e.stack);
      }

      throw e;
    }
  }
}
