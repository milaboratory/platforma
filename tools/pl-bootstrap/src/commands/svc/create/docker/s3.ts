import { Command, Args } from '@oclif/core';
import path from 'node:path';
import type * as types from '../../../../templates/types';
import Core from '../../../../core';
import * as cmdOpts from '../../../../cmd-opts';
import * as util from '../../../../util';
import state from '../../../../state';
import { ArgParser } from '../arg-parser';

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

  static override args = {
    name: Args.string({ required: true }),
  };

  public async run(): Promise<void> {
    // Use custom parser instead of OCLIF parse
    const parser = new ArgParser(S3.flags);
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

    // Set default values for S3-specific flags
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

    // Log unknown flags that will be passed to backend
    if (backendCommands.length > 0) {
      logger.info(`Unknown flags will be passed to backend: ${backendCommands.join(' ')}`);
    }
  }
}
