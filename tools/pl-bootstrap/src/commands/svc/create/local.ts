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

  static args = {
    name: Args.string({ required: true }),
  };

  public async run(): Promise<void> {
    // Extract instance name from argv
    const nameIndex = this.argv.findIndex(arg => !arg.startsWith('-'));
    if (nameIndex === -1) {
      throw new Error('Instance name is required');
    }
    const instanceName = this.argv[nameIndex];

    // Parse known flags manually from argv
    const flags: any = {};
    for (const arg of this.argv) {
      if (arg.startsWith('--log-level=')) {
        flags['log-level'] = arg.split('=')[1];
      } else if (arg.startsWith('--grpc-port=')) {
        flags['grpc-port'] = parseInt(arg.split('=')[1]);
      } else if (arg.startsWith('--grpc-listen=')) {
        flags['grpc-listen'] = arg.split('=')[1];
      } else if (arg.startsWith('--monitoring-port=')) {
        flags['monitoring-port'] = parseInt(arg.split('=')[1]);
      } else if (arg.startsWith('--monitoring-listen=')) {
        flags['monitoring-listen'] = arg.split('=')[1];
      } else if (arg.startsWith('--debug-port=')) {
        flags['debug-port'] = parseInt(arg.split('=')[1]);
      } else if (arg.startsWith('--debug-listen=')) {
        flags['debug-listen'] = arg.split('=')[1];
      } else if (arg.startsWith('--version=')) {
        flags.version = arg.split('=')[1];
      } else if (arg.startsWith('--pl-binary=')) {
        flags['pl-binary'] = arg.split('=')[1];
      } else if (arg.startsWith('--pl-sources=')) {
        flags['pl-sources'] = arg.split('=')[1];
      } else if (arg.startsWith('--config=')) {
        flags.config = arg.split('=')[1];
      } else if (arg.startsWith('--license=')) {
        flags.license = arg.split('=')[1];
      } else if (arg.startsWith('--license-file=')) {
        flags['license-file'] = arg.split('=')[1];
      } else if (arg.startsWith('--storage=')) {
        flags.storage = arg.split('=')[1];
      } else if (arg.startsWith('--storage-primary=')) {
        flags['storage-primary'] = arg.split('=')[1];
      } else if (arg.startsWith('--storage-work=')) {
        flags['storage-work'] = arg.split('=')[1];
      } else if (arg.startsWith('--storage-library=')) {
        flags['storage-library'] = arg.split('=')[1];
      } else if (arg.startsWith('--pl-log-file=')) {
        flags['pl-log-file'] = arg.split('=')[1];
      } else if (arg.startsWith('--pl-workdir=')) {
        flags['pl-workdir'] = arg.split('=')[1];
      } else if (arg === '--auth-enabled') {
        flags['auth-enabled'] = true;
      } else if (arg.startsWith('--auth-htpasswd-file=')) {
        flags['auth-htpasswd-file'] = arg.split('=')[1];
      } else if (arg.startsWith('--auth-ldap-server=')) {
        flags['auth-ldap-server'] = arg.split('=')[1];
      } else if (arg.startsWith('--auth-ldap-default-dn=')) {
        flags['auth-ldap-default-dn'] = arg.split('=')[1];
      }
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

    // Collect all unknown flags as backend commands
    // Get all known flags from the command definition
    const knownFlagNames = new Set(Object.keys(Local.flags));
    
    const backendCommands: string[] = [];
    for (const arg of this.argv) {
      if (arg.startsWith('--') && !arg.includes('=')) {
        const flagName = arg.substring(2);
        if (!knownFlagNames.has(flagName)) {
          backendCommands.push(arg);
        }
      } else if (arg.startsWith('--') && arg.includes('=')) {
        const flagName = arg.substring(2, arg.indexOf('='));
        if (!knownFlagNames.has(flagName)) {
          backendCommands.push(arg);
        }
      }
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
  }
}
