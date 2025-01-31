import { Command, Args } from '@oclif/core';
import path from 'node:path';
import type { startLocalOptions } from '../../../core';
import Core from '../../../core';
import * as cmdOpts from '../../../cmd-opts';
import * as util from '../../../util';
import state from '../../../state';
import * as platforma from '../../../platforma';

export default class Local extends Command {
  static override description = 'Run Platforma Backend service as local process on current host (no docker container)';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    ...cmdOpts.GlobalFlags,
    ...cmdOpts.VersionFlag,

    ...cmdOpts.S3AddressesFlags,
    ...cmdOpts.AddressesFlags,
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
    ...cmdOpts.AuthFlags,
  };

  static args = {
    name: Args.string({ required: true }),
    mode: Args.string({ options: ['s3'], required: false }),
  };

  public async run(): Promise<void> {
    const { flags, args } = await this.parse(Local);

    const logger = util.createLogger(flags['log-level']);
    const core = new Core(logger);
    core.mergeLicenseEnvs(flags);

    const instanceName = args.name;

    const workdir = flags['pl-workdir'] ?? '.';
    const storage = flags.storage ? path.join(workdir, flags.storage) : state.instanceDir(instanceName);
    const logFile = flags['pl-log-file'] ? path.join(workdir, flags['pl-log-file']) : undefined;

    const authDrivers = core.initAuthDriversList(flags, workdir);
    const authEnabled = flags['auth-enabled'] ?? authDrivers !== undefined;

    let binaryPath = flags['pl-binary'];
    if (flags['pl-sources']) {
      binaryPath = core.buildPlatforma({ repoRoot: flags['pl-sources'] });
    }

    let listenGrpc: string = '127.0.0.1:6345';
    if (flags['grpc-listen']) listenGrpc = flags['grpc-listen'];
    else if (flags['grpc-port']) listenGrpc = `127.0.0.1:${flags['grpc-port']}`;

    let listenMon: string = '127.0.0.1:9090';
    if (flags['monitoring-listen']) listenMon = flags['monitoring-listen'];
    else if (flags['monitoring-port']) listenMon = `127.0.0.1:${flags['monitoring-port']}`;

    let listenDbg: string = '127.0.0.1:9091';
    if (flags['debug-listen']) listenDbg = flags['debug-listen'];
    else if (flags['debug-port']) listenDbg = `127.0.0.1:${flags['debug-port']}`;

    const startOptions: startLocalOptions = {
      binaryPath: binaryPath,
      version: flags.version,
      configPath: flags.config,
      workdir: flags['pl-workdir'],

      primaryURL: flags['storage-primary'],
      libraryURL: flags['storage-library'],

      configOptions: {
        grpc: { listen: listenGrpc },
        monitoring: { listen: listenMon },
        debug: { listen: listenDbg },
        license: { value: flags['license'], file: flags['license-file'] },
        log: { path: logFile },
        localRoot: storage,
        core: { auth: { enabled: authEnabled, drivers: authDrivers } },
        storages: {
          work: { type: 'FS', rootPath: flags['storage-work'] },
        },
      },
    };

    const mode = args.mode;

    switch (mode) {
      case 's3': {
        logger.info(`Creating instance configuration, data directory and other stuff...`);
        core.createLocalS3(instanceName, {
          ...startOptions,

          minioPort: flags['s3-port'],
          minioConsolePort: flags['s3-console-port'],
        });
        break;
      }
      case undefined: {
        if (flags['s3-port']) {
          logger.warn('flag \'s3-port\' is only for \'s3\' mode');
        }
        if (flags['s3-console-port']) {
          logger.warn('flag \'s3-console-port\' is only for \'s3\' mode');
        }

        core.createLocal(instanceName, startOptions);
        break;
      }
    }

    if (startOptions.binaryPath) {
      logger.info(`Instance '${instanceName}' was created. To start it run 'up' command`);
      return;
    }

    platforma
      .getBinary(logger, { version: flags.version })
      .then(() => logger.info(`Instance '${instanceName}' was created. To start it run 'pl up' command`))
      .catch(function (err: Error) {
        logger.error(err.message);
      });
  }
}
