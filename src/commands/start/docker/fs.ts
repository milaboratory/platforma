import { Command } from '@oclif/core';
import Core from '../../../core';
import * as cmdOpts from '../../../cmd-opts';
import * as util from '../../../util';
import * as types from '../../../templates/types';

export default class FS extends Command {
  static override description = "Run platforma backend service with 'FS' primary storage type";

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    ...cmdOpts.GlobalFlags,

    ...cmdOpts.ImageFlag,
    ...cmdOpts.VersionFlag,

    ...cmdOpts.AuthFlags,
    ...cmdOpts.LicenseFlags,

    ...cmdOpts.StoragePrimaryPathFlag,
    ...cmdOpts.StorageWorkPathFlag,
    ...cmdOpts.StorageLibraryPathFlag
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(FS);

    const logger = util.createLogger(flags['log-level']);
    const core = new Core(logger);
    core.mergeLicenseEnvs(flags);

    const authEnabled = flags['auth-enabled'];
    const authOptions: types.authOptions | undefined = authEnabled
      ? {
          enabled: authEnabled,
          drivers: core.initAuthDriversList(flags, '.')
        }
      : undefined;

    core.startDockerFS({
      primaryStorage: flags['storage-primary'],
      workStorage: flags['storage-work'],
      libraryStorage: flags['storage-library'],

      image: flags.image,
      version: flags.version,

      license: flags['license'],
      licenseFile: flags['license-file'],

      auth: authOptions
    });
  }
}
