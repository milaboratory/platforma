import { Command } from '@oclif/core';
import * as cmdOpts from '../core/cmd-opts';
import * as util from '../core/util';
import { Core } from '../core/core';

export default class Prepublish extends Command {
  static override description = 'build *.sw.json files and do other preparations for publishing';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    ...cmdOpts.GlobalFlags,
    ...cmdOpts.BuildFlags,

    ...cmdOpts.DirHashFlag,
    ...cmdOpts.VersionFlag,
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Prepublish);
    const logger = util.createLogger(flags['log-level']);

    const core = new Core(logger, { packageRoot: flags['package-root'] });
    core.buildMode = cmdOpts.modeFromFlag(flags.dev as cmdOpts.devModeName);
    core.pkgInfo.version = flags.version;
    core.fullDirHash = flags['full-dir-hash'];

    core.buildDescriptors();
  }
}
