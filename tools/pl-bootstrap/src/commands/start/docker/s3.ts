import path from 'path';

import { Command } from '@oclif/core';
import Core from '../../../core';
import * as cmdOpts from '../../../cmd-opts';
import * as util from '../../../util';
import * as types from '../../../templates/types';
import state from '../../../state';

export default class S3 extends Command {
  static override description = "Run platforma backend service with 'S3' primary storage type";

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    ...cmdOpts.GlobalFlags,

    ...cmdOpts.AddressesFlags,
    ...cmdOpts.ImageFlag,
    ...cmdOpts.VersionFlag,

    ...cmdOpts.StorageFlag,

    ...cmdOpts.LicenseFlags,
    ...cmdOpts.AuthFlags
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(S3);

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

    const storage = flags.storage ? path.join('.', flags.storage) : state.path('data', 'docker-s3');

    core.startDockerS3(storage, {
      image: flags.image,
      version: flags.version,

      license: flags['license'],
      licenseFile: flags['license-file'],

      auth: authOptions,

      'grpc-port': flags['grpc-port'],
      'debug-port': flags['debug-port'],
      'monitoring-port': flags['monitoring-port']
    });
  }
}
