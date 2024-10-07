import path from 'path';

import { Command } from '@oclif/core';
import Core, { startLocalS3Options } from '../../../core';
import * as cmdOpts from '../../../cmd-opts';
import * as platforma from '../../../platforma';
import * as util from '../../../util';
import state from '../../../state';

export default class S3 extends Command {
  static override description =
    'Run Platforma Backend service as local process on current host (no docker container)';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    ...cmdOpts.GlobalFlags,
    ...cmdOpts.VersionFlag,

    ...cmdOpts.AddressesFlags,
    ...cmdOpts.S3AddressesFlags,
    ...cmdOpts.PlBinaryFlag,
    ...cmdOpts.PlSourcesFlag,

    ...cmdOpts.ConfigFlag,

    ...cmdOpts.LicenseFlags,

    ...cmdOpts.StorageFlag,
    ...cmdOpts.StoragePrimaryURLFlag,
    ...cmdOpts.StorageWorkPathFlag,
    ...cmdOpts.StorageLibraryURLFlag,

    ...cmdOpts.PlLogFileFlag,
    ...cmdOpts.PlWorkdirFlag,
    ...cmdOpts.AuthFlags
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(S3);

    const logger = util.createLogger(flags['log-level']);
    const core = new Core(logger);
    core.mergeLicenseEnvs(flags);

    const workdir = flags['pl-workdir'] ?? '.';
    const storage = flags.storage ? path.join(workdir, flags.storage) : state.data('local-s3');
    const logFile = flags['pl-log-file'] ? path.join(workdir, flags['pl-log-file']) : undefined;

    const authDrivers = core.initAuthDriversList(flags, workdir);
    const authEnabled = flags['auth-enabled'] ?? authDrivers !== undefined;

    var binaryPath = flags['pl-binary'];
    if (flags['pl-sources']) {
      binaryPath = core.buildPlatforma({ repoRoot: flags['pl-sources'] });
    }

    var listenGrpc: string = '127.0.0.1:6345';
    if (flags['grpc-listen']) listenGrpc = flags['grpc-listen'];
    else if (flags['grpc-port']) listenGrpc = `127.0.0.1:${flags['grpc-port']}`;

    var listenMon: string = '127.0.0.1:9090';
    if (flags['monitoring-listen']) listenMon = flags['monitoring-listen'];
    else if (flags['monitoring-port']) listenMon = `127.0.0.1:${flags['monitoring-port']}`;

    var listenDbg: string = '127.0.0.1:9091';
    if (flags['debug-listen']) listenDbg = flags['debug-listen'];
    else if (flags['debug-port']) listenDbg = `127.0.0.1:${flags['debug-port']}`;

    const startOptions: startLocalS3Options = {
      binaryPath: binaryPath,
      version: flags.version,
      configPath: flags.config,
      workdir: flags['pl-workdir'],

      primaryURL: flags['storage-primary'],
      libraryURL: flags['storage-library'],

      minioPort: flags['s3-address-port'],
      minioConsolePort: flags['s3-console-address-port'],

      configOptions: {
        grpc: { listen: listenGrpc },
        monitoring: { listen: listenMon },
        debug: { listen: listenDbg },
        license: { value: flags['license'], file: flags['license-file'] },
        log: { path: logFile },
        localRoot: storage,
        core: {
          auth: { enabled: authEnabled, drivers: authDrivers }
        },
        storages: {
          work: { type: 'FS', rootPath: flags['storage-work'] }
        }
      }
    };

    if (startOptions.binaryPath) {
      core.startLocalS3(startOptions);
    } else {
      platforma
        .getBinary(logger, { version: flags.version })
        .then(() => core.startLocalS3(startOptions))
        .catch(function (err: Error) {
          logger.error(err.message);
        });
    }
  }
}
