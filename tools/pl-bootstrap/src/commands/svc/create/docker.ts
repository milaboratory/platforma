import { Command, Args } from '@oclif/core';
import path from 'node:path';
import type * as types from '../../../templates/types';
import Core from '../../../core';
import * as cmdOpts from '../../../cmd-opts';
import * as util from '../../../util';
import state from '../../../state';
import { ArgParser } from './arg-parser';

export default class Docker extends Command {
  static override description = 'Run Platforma Backend service as docker container on current host';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    ...cmdOpts.GlobalFlags,

    ...cmdOpts.AddressesFlags,
    ...cmdOpts.ImageFlag,
    ...cmdOpts.VersionFlag,
    ...cmdOpts.ArchFlag,

    ...cmdOpts.AuthFlags,
    ...cmdOpts.LicenseFlags,

    ...cmdOpts.MountFlag,
    ...cmdOpts.StorageFlag,
    ...cmdOpts.StoragePrimaryURLFlag,
    ...cmdOpts.StorageWorkPathFlag,
    ...cmdOpts.StorageLibraryURLFlag,
  };

  static override args = {
    name: Args.string({ required: true }),
  };

  public async run(): Promise<void> {
    // Use custom parser instead of OCLIF parse
    const parser = new ArgParser(Docker.flags);
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

    const platformOverride = flags.arch ? `linux/${flags.arch}` : undefined;

    core.createDocker(instanceName, storage, {
      primaryStorageURL: flags['storage-primary'],
      workStoragePath: flags['storage-work'],
      libraryStorageURL: flags['storage-library'],

      image: flags.image,
      version: flags.version,

      platformOverride: platformOverride,
      customMounts: mounts,

      license: flags['license'],
      licenseFile: flags['license-file'],

      auth: authOptions,

      grpcAddr: flags['grpc-listen'],
      grpcPort: flags['grpc-port'],

      monitoringAddr: flags['monitoring-listen'],
      monitoringPort: flags['monitoring-port'],

      debugAddr: flags['debug-listen'],
      debugPort: flags['debug-port'],

      backendCommands: backendCommands,
    });

    logger.info(`Instance '${instanceName}' was created. To start it run 'up' command`);

    // Log unknown flags that will be passed to backend
    if (backendCommands.length > 0) {
      logger.info(`Unknown flags will be passed to backend: ${backendCommands.join(' ')}`);
    }
  }
}
