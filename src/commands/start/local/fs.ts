import { Command } from '@oclif/core';
import path from 'path';
import Core, { startLocalFSOptions } from '../../../core';
import * as cmdOpts from '../../../cmd-opts';
import * as platforma from '../../../platforma';
import * as util from '../../../util';
import * as os from 'node:os';
import * as fs from 'node:fs';
import * as pkg from '../../../package';

export default class FS extends Command {
  static override description =
    'Run Platforma Backend service as local process on current host (no docker container)';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    ...cmdOpts.GlobalFlags,
    ...cmdOpts.VersionFlag,

    ...cmdOpts.PlBinaryFlag,
    ...cmdOpts.PlSourcesFlag,

    ...cmdOpts.ConfigFlag,

    ...cmdOpts.LicenseFlags,

    ...cmdOpts.StorageFlag,
    ...cmdOpts.StoragePrimaryPathFlag,
    ...cmdOpts.StorageWorkPathFlag,
    ...cmdOpts.StorageLibraryPathFlag,

    ...cmdOpts.PlLogFileFlag,
    ...cmdOpts.PlWorkdirFlag,
    ...cmdOpts.AuthFlags
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(FS);

    const logger = util.createLogger(flags['log-level']);
    const core = new Core(logger);
    core.mergeLicenseEnvs(flags);

    const workdir = flags['pl-workdir'] ?? '.';
    const storage = flags.storage
      ? path.resolve(workdir, flags.storage)
      : undefined;
    const logFile = flags['pl-log-file']
      ? path.resolve(workdir, flags['pl-log-file'])
      : 'stdout';

    const authDrivers = core.initAuthDriversList(flags, workdir);
    const authEnabled = flags['auth-enabled'] ?? authDrivers !== undefined;

    var binaryPath = flags['pl-binary'];
    if (flags['pl-sources']) {
      binaryPath = core.buildPlatforma({ repoRoot: flags['pl-sources'] });
    }

    const startOptions: startLocalFSOptions = {
      binaryPath: binaryPath,
      version: flags.version,
      configPath: flags.config,
      workdir: flags['pl-workdir'],

      configOptions: {
        license: { value: flags['license'], file: flags['license-file'] },
        log: { path: logFile },
        localRoot: storage,
        core: { auth: { enabled: authEnabled, drivers: authDrivers } },
        storages: {
          primary: { type: 'FS', rootPath: flags['storage-primary'] },
          work: { type: 'FS', rootPath: flags['storage-work'] },
          library: { type: 'FS', rootPath: flags['storage-library'] }
        }
      }
    };

    if (startOptions.binaryPath) {
      core.startLocalFS(startOptions);
    } else {
      platforma
        .getBinary(logger, { version: flags.version })
        .then(() => core.startLocalFS(startOptions))
        .catch(function (err: Error) {
          logger.error(err.message);
        });
    }
  }
}
