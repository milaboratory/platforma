import { Command } from '@oclif/core';
import * as cmdOpts from '../../core/cmd-opts';
import * as util from '../../core/util';
import { Core } from '../../core/core';
import * as envs from '../../core/envs';
import * as docker from '../../core/docker';

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
    ...cmdOpts.DockerFlags,

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
      core.pkgInfo.version = flags.version;
      core.targetPlatform = flags.platform as util.PlatformType;
      core.allPlatforms = flags['all-platforms'];
      core.fullDirHash = flags['full-dir-hash'];

      if (
        core.buildMode !== 'dev-local'
        && docker.shouldBuild(envs.isCI(), flags['docker-build'], flags['docker-no-build'])
      ) {
        core.buildDockerImages({
          ids: flags['package-id'],
          registry: flags['docker-registry'],
        });
      }

      await core.buildPackages({
        ids: flags['package-id'],
        forceBuild: flags.force,

        archivePath: flags.archive,
        contentRoot: flags['content-root'],
        skipIfEmpty: flags['package-id'] ? false : true, // do not skip 'non-binary' packages if their IDs were set as args
      });

      core.buildDescriptors({
        packageIds: flags['package-id'] ? flags['package-id'] : undefined,
      });

      const autopush = flags['docker-autopush'] || (envs.isCI() && core.buildMode === 'release');
      if (!flags['skip-docker-build'] && autopush) {
        // TODO: as we do not create content-addressable archives for binary packages, we should not upload them
        //       for each build to not spoil release process with dev archives cached by CDN.
        //       once we support content-addressable archives, we can publish everything here (not just docker).
        core.publishDockerImages({
          ids: flags['package-id'],
          pushTo: flags['docker-push-to'],
        });
      }
    } catch (e) {
      logger.debug(e);
      if (e instanceof Error) {
        logger.debug(e.stack);
      }

      throw e;
    }
  }
}
