import { Command, Args } from '@oclif/core';
import path from 'node:path';
import type * as types from '../../../templates/types';
import Core from '../../../core';
import * as cmdOpts from '../../../cmd-opts';
import * as util from '../../../util';
import state from '../../../state';

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

  static args = {
    name: Args.string({ required: true }),
  };

  public async run(): Promise<void> {
    const { flags, args } = await this.parse(Docker);

    const logger = util.createLogger(flags['log-level']);
    const core = new Core(logger);
    core.mergeLicenseEnvs(flags);

    const instanceName = args.name;

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
    });

    logger.info(`Instance '${instanceName}' was created. To start it run 'up' command`);
  }
}
