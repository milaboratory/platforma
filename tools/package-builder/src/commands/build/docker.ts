import { Command } from '@oclif/core';
import * as cmdOpts from '../../core/cmd-opts';
import * as util from '../../core/util';
import { Core } from '../../core/core';
import * as envs from '../../core/envs';

export default class Docker extends Command {
  static override description = 'build docker images';

  static override flags = {
    ...cmdOpts.GlobalFlags,
    ...cmdOpts.BuildFlags,
    ...cmdOpts.VersionFlag,
    ...cmdOpts.PackageIDFlag,
    ...cmdOpts.DockerFlags,
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Docker);
    const logger = util.createLogger(flags['log-level']);

    const core = new Core(logger, { packageRoot: flags['package-root'] });
    core.buildMode = cmdOpts.modeFromFlag(flags.dev as cmdOpts.devModeName);

    core.pkgInfo.version = flags.version;

    core.buildDockerImages({
      ids: flags['package-id'],
    });

    if (!flags['skip-docker-push'] && core.buildMode === 'release') {
      core.publishDockerImages({
        ids: flags['package-id'],
      });
    }

    if (!envs.isCI()) {
      // CI environment may prebuild packages on different agents in parallel.
      // In that case we should assemble all built artifacts info sw.json in one step before publishing package, not after each partial build.
      core.buildDescriptors({
        packageIds: flags['package-id'] ? flags['package-id'] : undefined,
      });
    }
  }
}
