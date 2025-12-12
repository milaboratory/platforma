import { Command, Args } from '@oclif/core';
import path from 'node:path';
import type { createLocalOptions } from '../../../core';
import Core from '../../../core';
import * as cmdOpts from '../../../cmd-opts';
import * as util from '../../../util';
import state from '../../../state';
import * as platforma from '../../../platforma';
import * as os from 'node:os';
import type * as types from '../../../templates/types';
import { ArgParser } from './arg-parser';

export default class Local extends Command {
  static override description = 'Run Platforma Backend service as local process on current host (no docker container)';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    ...cmdOpts.GlobalFlags,
    ...cmdOpts.VersionFlag,

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

  static override args = {
    name: Args.string({ required: true }),
  };

  public async run(): Promise<void> {
    // Use custom parser instead of OCLIF parse
    const parser = new ArgParser(Local.flags);
    const parsed = parser.parse(this.argv);

    // Validate required flags
    const errors = parser.validateRequired(parsed.knownFlags);
    if (errors.length > 0) {
      throw new Error(`Validation errors:\n${errors.join('\n')}`);
    }

    const instanceName = parsed.instanceName;
    const flags = parsed.knownFlags;
    const backendCommands = parsed.unknownFlags;
    if (flags['log-level']) {
      backendCommands.push(`--log-level=${flags['log-level']}`);
    }

    // Set default values for flags that weren't specified
    if (!flags['log-level']) flags['log-level'] = 'info';
    if (!flags['grpc-port']) flags['grpc-port'] = 6345;
    if (!flags['grpc-listen']) flags['grpc-listen'] = '127.0.0.1:6345';
    if (!flags['monitoring-port']) flags['monitoring-port'] = 9090;
    if (!flags['monitoring-listen']) flags['monitoring-listen'] = '127.0.0.1:9090';
    if (!flags['debug-port']) flags['debug-port'] = 9091;
    if (!flags['debug-listen']) flags['debug-listen'] = '127.0.0.1:9091';

    const logger = util.createLogger(flags['log-level'] || 'info');
    const core = new Core(logger);
    core.mergeLicenseEnvs(flags);

    const authEnabled = flags['auth-enabled'];
    const authOptions: types.authOptions | undefined = authEnabled
      ? {
          enabled: authEnabled,
          drivers: core.initAuthDriversList(flags, '.'),
        }
      : undefined;

    const storage = flags.storage ? path.join('.', flags.storage) : state.instanceDir(instanceName);

    const mounts: { hostPath: string; containerPath?: string }[] = [];
    for (const p of flags.mount ?? []) {
      mounts.push({ hostPath: p });
    }

    const createOptions: createLocalOptions = {
      sourcesPath: flags['pl-sources'],
      binaryPath: flags['pl-binary'],

      version: flags.version,
      configPath: flags.config,
      workdir: flags['pl-workdir'],

      primaryURL: flags['storage-primary'],
      libraryURL: flags['storage-library'],

      backendCommands: backendCommands,

      configOptions: {
        grpc: { listen: flags['grpc-listen'] },
        monitoring: { listen: flags['monitoring-listen'] },
        debug: { listen: flags['debug-listen'] },
        license: { value: flags['license'], file: flags['license-file'] },
        log: { path: flags['pl-log-file'] },
        localRoot: storage,
        core: { auth: authOptions },
        storages: {
          work: { type: 'FS', rootPath: flags['storage-work'] },
        },

        // Backend could consume a lot of CPU power,
        // we want to keep at least a couple for UI and other apps to work.
        numCpu: Math.max(os.cpus().length - 2, 1),
      },
    };

    core.createLocal(instanceName, createOptions);

    if (createOptions.binaryPath || createOptions.sourcesPath) {
      logger.info(`Instance '${instanceName}' was created. To start it run 'up' command`);
      return;
    }

    platforma
      .getBinary(logger, { version: flags.version })
      .then(() => logger.info(`Instance '${instanceName}' was created. To start it run 'svc up' command`))
      .catch(function (err: Error) {
        logger.error(err.message);
      });

    // Log unknown flags that will be passed to backend
    if (backendCommands.length > 0) {
      logger.info(`Unknown flags will be passed to backend: ${backendCommands.join(' ')}`);
    }
  }
}
