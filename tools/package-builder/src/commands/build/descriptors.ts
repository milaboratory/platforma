import { Command } from '@oclif/core';
import * as cmdOpts from '../../core/cmd-opts';
import * as util from '../../core/util';
import { Core } from '../../core/core';

export default class Descriptors extends Command {
  static override description = 'build *.sw.json from package.json';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    ...cmdOpts.GlobalFlags,
    ...cmdOpts.BuildFlags,

    ...cmdOpts.EntrypointNameFlag,
    ...cmdOpts.DirHashFlag,
    ...cmdOpts.PackageIDFlag,
    ...cmdOpts.VersionFlag,
    ...cmdOpts.SourceFlag
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Descriptors);
    const logger = util.createLogger(flags['log-level']);

    const core = new Core(logger);
    core.buildMode = cmdOpts.modeFromFlag(flags.dev as cmdOpts.devModeName);
    core.pkg.version = flags.version;
    core.fullDirHash = flags['full-dir-hash'];

    core.buildDescriptors({
      ids: flags['package-id'] ? flags['package-id'] : undefined,
      entrypoints: flags.entrypoint ? flags.entrypoint : undefined,
      sources: flags.source ? (flags.source as util.SoftwareSource[]) : undefined
    });
  }
}
