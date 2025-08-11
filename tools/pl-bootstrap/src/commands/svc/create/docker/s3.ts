import { Command, Args } from '@oclif/core';
import path from 'node:path';
import type * as types from '../../../../templates/types';
import Core from '../../../../core';
import * as cmdOpts from '../../../../cmd-opts';
import * as util from '../../../../util';
import state from '../../../../state';

export default class S3 extends Command {
  static override description = 'Run Platforma Backend service as docker container on current host with MinIO as local S3 storage';

  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    ...cmdOpts.GlobalFlags,

    ...cmdOpts.AddressesFlags,
    ...cmdOpts.S3AddressesFlags,
    ...cmdOpts.ImageFlag,
    ...cmdOpts.VersionFlag,
    ...cmdOpts.ArchFlag,

    ...cmdOpts.AuthFlags,
    ...cmdOpts.LicenseFlags,

    ...cmdOpts.MountFlag,
    ...cmdOpts.StorageFlag,
    ...cmdOpts.MinioPresignHostFlag,
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
      } else if (arg.startsWith('--version=')) {
        flags.version = arg.split('=')[1];
      } else if (arg.startsWith('--image=')) {
        flags.image = arg.split('=')[1];
      } else if (arg.startsWith('--arch=')) {
        flags.arch = arg.split('=')[1];
      } else if (arg === '--auth-enabled') {
        flags['auth-enabled'] = true;
      } else if (arg.startsWith('--license=')) {
        flags.license = arg.split('=')[1];
      } else if (arg.startsWith('--license-file=')) {
        flags['license-file'] = arg.split('=')[1];
      } else if (arg.startsWith('--storage=')) {
        flags.storage = arg.split('=')[1];
      } else if (arg.startsWith('--s3-port=')) {
        flags['s3-port'] = parseInt(arg.split('=')[1]);
      } else if (arg.startsWith('--s3-console-port=')) {
        flags['s3-console-port'] = parseInt(arg.split('=')[1]);
      } else if (arg === '--minio-presign-host') {
        flags['minio-presign-host'] = true;
      }
    }
    
    // Set default values for flags that weren't specified
    if (!flags['log-level']) flags['log-level'] = 'info';
    if (!flags['s3-port']) flags['s3-port'] = 9000;
    if (!flags['s3-console-port']) flags['s3-console-port'] = 9001;

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
    const presignHost = flags['minio-presign-host'] ? 'minio' : 'localhost';

    // Collect all unknown flags as backend commands
    // Get all known flags from the command definition
    const knownFlagNames = new Set(Object.keys(S3.flags));
    
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

    core.createDockerS3(instanceName, storage, {
      image: flags.image,
      version: flags.version,

      license: flags['license'],
      licenseFile: flags['license-file'],

      platformOverride: platformOverride,
      customMounts: mounts,

      auth: authOptions,

      grpcAddr: flags['grpc-listen'],
      grpcPort: flags['grpc-port'],

      monitoringAddr: flags['monitoring-listen'],
      monitoringPort: flags['monitoring-port'],

      debugAddr: flags['debug-listen'],
      debugPort: flags['debug-port'],

      s3Port: flags['s3-port'],
      s3ConsolePort: flags['s3-console-port'],

      presignHost: presignHost,

      backendCommands: backendCommands,
    });

    logger.info(`Instance '${instanceName}' was created. To start it run 'up' command`);
    if (flags['minio-presign-host']) {
      logger.info('  NOTE: make sure you have \'minio\' host in your hosts file as 127.0.0.1 address');
    }
  }
}
