import { Command } from '@oclif/core';
import * as cmdOpts from '../../../core/cmd-opts';
import * as util from '../../../core/util';
import { Core } from '../../../core/core';

export default class Version extends Command {
  static override description = 'get version of software package to be built and published';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    ...cmdOpts.GlobalFlags,

    ...cmdOpts.PackageIDRequiredFlag,
  };

  static strict: boolean = false;

  public async run(): Promise<void> {
    const { flags } = await this.parse(Version);
    const logger = util.createLogger(flags['log-level']);

    const core = new Core(logger);
    const pkgID = flags['package-id'];

    const pkg = core.getPackage(pkgID);
    console.log(pkg.version);
  }
}
