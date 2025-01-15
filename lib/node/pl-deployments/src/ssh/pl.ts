import type * as ssh from 'ssh2';
import { SshClient } from './ssh';
import { ConsoleLoggerAdapter, type MiLogger } from '@milaboratories/ts-helpers';
import type { PlBinarySource } from '../common/pl_binary';
import { newDefaultPlBinarySource, resolveLocalPlBinaryPath } from '../common/pl_binary';
import { downloadBinary, downloadPlBinary } from '../common/pl_binary_download';
import { platform } from 'os';
import path, { resolve } from 'path';
import { getDefaultPlVersion } from '../common/pl_version';

export class SshPl {
  public readonly remoteBinDirectory = '/home/pl-doctor/platforma_ssh/binaries';

  constructor(
    public readonly sshClient: SshClient,
  ) {}

  public static async init(config: ssh.ConnectConfig) {
    try {
      const sshClient = await SshClient.init(config);
      return new SshPl(sshClient);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      console.error('Connection error in SshClient.init', e);
      return null;
    }
  }

  public async getArch(): Promise<{ platform: string; arch: string } | null> {
    const { stdout, stderr } = await this.sshClient.exec('uname -s && uname -m');
    if (stderr) return null;
    const arr = stdout.split('\n');
    return {
      platform: arr[0],
      arch: arr[1],
    };
  }

  public async isAlive() {
    return true;
  }

  public async fetchPorts() {
    // FIXME need implementation
    return {
      grpc: 42097,
      monitoring: 39841,
      debug: 37659,
      minioPort: 9000,
      minioConsolePort: 9001,
    };
  }

  public async downloadPlatformaBinaries(dirname: string) {
    const platformInfo = await this.getArch();
    if (platformInfo) {
      const path = downloadPlBinary(new ConsoleLoggerAdapter(), dirname, getDefaultPlVersion(), platformInfo?.arch, platformInfo?.platform);
      return path;
    }
    return null;
  }

  public async platformaInit(plWorkingDirname: string) {
    const platformInfo = await this.getArch();

    const supervisordSoftwareName = 'supervisord';
    const supervisordTgzName = 'supervisord-0.7.3';

    const minioSoftwareName = 'minio';
    const minioTgzName = 'minio-2024-12-18T13-15-44Z';

    const plPath = await this.downloadPlatformaBinaries(plWorkingDirname);

    const supervisordPath = await downloadBinary(
      new ConsoleLoggerAdapter(),
      plWorkingDirname,
      supervisordSoftwareName,
      supervisordTgzName,
      platformInfo!.arch,
      platformInfo!.platform,
    );
    const minioPath = await downloadBinary(
      new ConsoleLoggerAdapter(),
      plWorkingDirname,
      minioSoftwareName,
      minioTgzName,
      platformInfo!.arch,
      platformInfo!.platform,
    );

    const binBasePath = path.join(await this.sshClient.getUserHomeDirectory(), 'platforma_ssh/binaries');

    await this.sshClient.createRemoteDirectory(binBasePath);

    const binDirs = [
      path.basename(path.dirname(path.dirname(plPath!))),
      // path.basename(supervisordPath!),
      // path.basename(minioPath!),
    ];

    for (const dir of binDirs) {
      const local = path.resolve(plWorkingDirname, dir);
      const remote = path.resolve(binBasePath, dir);

      console.log('local, remote', local, remote);

      await this.sshClient.uploadDirectory(
        path.resolve(plWorkingDirname, dir),
        path.resolve(binBasePath, dir),
      );
    }

    return {
      plPath, supervisordPath, minioPath,
    };
  }

  public async start() {
    return;
  }

  public async stop() {
    return;
  }
}

/** Options to start ssh pl-backend and minio. */
export type SshPlOptions = {
  /** From what directory start a process. */
  readonly workingDir: string;
  readonly sshConfig: ssh.ConnectConfig;
  /** A string representation of yaml config. */
  readonly config: string;
  /** How to get a binary, download it or get an existing one (default: download latest version) */
  readonly plBinary?: PlBinarySource;

  readonly onClose?: (pl: SshPl) => Promise<void>;
  readonly onError?: (pl: SshPl) => Promise<void>;
  readonly onCloseAndError?: (pl: SshPl) => Promise<void>;
  readonly onCloseAndErrorNoStop?: (pl: SshPl) => Promise<void>;
};

/** Does the following:
 - opens ssh connection
 - checks arch and OS of the remote server
 - downloads pl backend and minio
 - transfers them to the remote server
 - finds free ports there
 - generates config by the given ports
 - transfers all required files and creates required dirs.
 - starts Pl Backend and minio there. */
export async function sshPlatformaInit(
  logger: MiLogger,
  sshClient: ssh.Client,
  _ops: SshPlOptions,
): Promise<SshPl> {
  // we'll trace all steps (or "state" of this platforma init process)
  // in this context and print it
  // if something goes wrong.
  const ctx: {
    ops?: SshPlOptions;
    sshConnected?: boolean;
  } = {};

  try {
    ctx.ops = {
      plBinary: newDefaultPlBinarySource(),
      ..._ops,
    };

    // opens ssh connection
    await sshConnect(sshClient, ctx.ops.sshConfig);
    ctx.sshConnected = true;

    //

    sshExec(sshClient, 'uname -s');

    downloadPlBinary(logger, baseDir, plVersion, arch, platform);
    //
  } catch (e: any) {
    logger.error(`sshPlatformaInit: something went wrong: ${e}, ctx: ${JSON.stringify(ctx)}`);
  }
}
