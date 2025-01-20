import type * as ssh from 'ssh2';
import { SshClient } from './ssh';
import { ConsoleLoggerAdapter, type MiLogger } from '@milaboratories/ts-helpers';
import type { PlBinarySource } from '../common/pl_binary';
import { newDefaultPlBinarySource, resolveLocalPlBinaryPath } from '../common/pl_binary';
import { downloadBinary, downloadPlBinary } from '../common/pl_binary_download';
import { platform } from 'os';
import path, { resolve } from 'path';
import { getDefaultPlVersion } from '../common/pl_version';
import { newArch } from '../common/os_and_arch';
import net from 'net';
import type { MinioConfig, SshPlConfigGenerationResult } from '@milaboratories/pl-config';
import { generateSshPlConfigs, getFreePort } from '@milaboratories/pl-config';
import { randomBytes } from 'crypto';
import fs from 'fs';
// import {getFreePort} from ''

function logToFile(message: string) {
  const logFileName = 'SD.txt';
  const logFilePath = path.join(__dirname, logFileName);

  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  // eslint-disable-next-line @stylistic/type-annotation-spacing, @typescript-eslint/no-explicit-any
  fs.writeFile(logFilePath, logMessage, (err:any) => {
    if (err) {
      console.error('Error write to log file:', err);
    }
  });
}

export class SshPl {
  public readonly minioDirName = 'minio-2024-12-18T13-15-44Z';
  public readonly supervisordDirName = 'supervisord-0.7.3';
  public readonly supervisordSubDirName = 'supervisord_0.7.3_Linux_64-bit';

  public serverInfo: Awaited<ReturnType <typeof this.getArch>> = { platform: '', arch: '' };

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
    if (this.serverInfo?.platform && this.serverInfo.arch) {
      return this.serverInfo;
    }
    const { stdout, stderr } = await this.sshClient.exec('uname -s && uname -m');
    if (stderr) return null;
    const arr = stdout.split('\n');

    this.serverInfo = {
      platform: arr[0],
      arch: arr[1],
    };

    return this.serverInfo;
  }

  public async isAlive() {
    return true;
  }

  public async fetchPorts() {
    const ports = {
      grpc: {
        local: await getFreePort(),
        remote: await this.getFreePortForPlatformaOnServer(),
      },
      monitoring: {
        local: await getFreePort(),
        remote: await this.getFreePortForPlatformaOnServer(),
      },
      debug: {
        local: await getFreePort(),
        remote: await this.getFreePortForPlatformaOnServer(),
      },
      minioPort: {
        local: await getFreePort(),
        remote: await this.getFreePortForPlatformaOnServer(),
      },
      minioConsolePort: {
        local: await getFreePort(),
        remote: await this.getFreePortForPlatformaOnServer(),
      },
    };

    Object.entries(ports).forEach(([key, value]) => {
      if (!value.local || !value.remote) {
        throw new Error(`Port for ${key} is null`);
      }
    });

    return ports;
  }

  public async downloadPlatformaBinaries(dirname: string) {
    const platformInfo = await this.getArch();
    if (platformInfo) {
      const path = downloadPlBinary(new ConsoleLoggerAdapter(), dirname, getDefaultPlVersion(), platformInfo?.arch, platformInfo?.platform);
      return path;
    }
    return null;
  }

  public async getPlatformaRemoteWorkingDir() {
    return path.join(await this.sshClient.getUserHomeDirectory(), 'platforma_ssh');
  }

  public async getBinariesHomeDir() {
    return path.join(await this.sshClient.getUserHomeDirectory(), 'platforma_ssh/binaries');
  }

  public async getSupervisorBinDirOnServer() {
    return path.join(await this.getBinariesHomeDir(), 'supervisord-0.7.3-amd64', this.supervisordSubDirName);
  }

  public async getSupervisorConfOnServer() {
    return path.join(await this.getPlatformaRemoteWorkingDir(), 'supervisor.conf');
  }

  public async getPlatformaDirName() {
    const info = await this.getArch();
    return `pl-${getDefaultPlVersion()}-${newArch(info!.arch)}`;
  }

  public async getLocalFreePort(): Promise<number> {
    return new Promise((res) => {
      const srv = net.createServer();
      srv.listen(0, () => {
        const port = (srv.address() as net.AddressInfo).port;
        srv.close((_) => res(port));
      });
    });
  }

  public async platformaInit(plWorkingDirname: string) {
    const platformInfo = await this.getArch();
    const supervisordSoftwareName = 'supervisord';
    const minioSoftwareName = 'minio';

    const plPath = await this.downloadPlatformaBinaries(plWorkingDirname);

    const supervisordPath = await downloadBinary(
      new ConsoleLoggerAdapter(),
      plWorkingDirname,
      supervisordSoftwareName,
      this.supervisordDirName,
      platformInfo!.arch,
      platformInfo!.platform,
    );

    const minioPath = await downloadBinary(
      new ConsoleLoggerAdapter(),
      plWorkingDirname,
      minioSoftwareName,
      this.minioDirName,
      platformInfo!.arch,
      platformInfo!.platform,
    );

    console.log('supervisordPath, minioPath', supervisordPath, minioPath);

    const binBasePath = await this.getBinariesHomeDir();
    await this.sshClient.createRemoteDirectory(binBasePath);
    const binDirs = [
      path.basename(path.dirname(path.dirname(plPath!))),
      path.basename(supervisordPath!),
      path.basename(minioPath!),
    ];

    for (const dir of binDirs) {
      await this.sshClient.uploadDirectory(
        path.resolve(plWorkingDirname, dir),
        path.resolve(binBasePath, dir),
        0o760,
      );
    }

    const ports = await this.fetchPorts();

    const config = await generateSshPlConfigs({
      logger: new ConsoleLoggerAdapter(),
      workingDir: await this.getPlatformaRemoteWorkingDir(),
      portsMode: {
        type: 'customWithMinio',
        ports: {
          debug: ports.debug.remote,
          grpc: ports.grpc.remote,
          minio: ports.minioPort.remote,
          minioConsole: ports.minioConsolePort.remote,
          monitoring: ports.monitoring.remote,

          grpcLocal: ports.grpc.local,
          minioLocal: ports.minioPort.local,
        },
      },
      licenseMode: {
        type: 'env',
      },
    });

    console.log('config.workingDir', config.workingDir);
    console.log(config.plConfig.configPath);
    console.log(config.minioConfig.storageDir);
    // config.plConfig.configPath

    for (const [filePath, content] of Object.entries(config.filesToCreate)) {
      await this.sshClient.writeFileOnTheServer(filePath, content);
      console.log(`Created file ${filePath}`);
    }

    for (const dir of config.dirsToCreate) {
      await this.sshClient.createRemoteDirectory(dir);
      console.log(`Created directory ${dir}`);
    }

    const supervisorConfig = await this.generateSupervisordConfig(config);

    logToFile(supervisorConfig);

    const writeResult = await this.sshClient.writeFileOnTheServer(await this.getSupervisorConfOnServer(), supervisorConfig);
    if (!writeResult) {
      console.error(`Can not write supervisord config on the server ${await this.getPlatformaRemoteWorkingDir()}`);
    }

    // const command = `${path.join(await this.getSupervisorBinDirOnServer(), 'supervisord')} -c ${await this.getSupervisorConfOnServer()}`;
    // console.log('command', command);
    // const runSupervisord = await this.sshClient.exec(command);
    // console.log('runSupervisord', runSupervisord);
    // supervisord
    // - create config plConfig minioConfig supervisord -c supervisor.conf -d

    return {
      supervisord: supervisorConfig,
      plUser: config.plUser,
      plPassword: config.plPassword,
      filesToCreate: config.filesToCreate,
      dirsToCreate: config.dirsToCreate,
    };
  }

  public async generateSupervisordConfig(config: SshPlConfigGenerationResult) {
    const minioEnvStr = Object.entries(config.minioConfig.envs).map((arr) => arr.join('=')).join(', ');
    const sshPlatforma = await this.getBinariesHomeDir();
    const password = randomBytes(16).toString('hex');
    const freePort = await this.getFreePortForPlatformaOnServer();
    const plDirName = await this.getPlatformaDirName();
    const osInfo = await this.getArch();

    return `
[supervisord]
logfile=${config.workingDir}/supervisord.log
loglevel=info
pidfile=${config.workingDir}/supervisord.pid

[inet_http_server]
port=127.0.0.1:${freePort}
username=default-user
password=${password}

[supervisorctl]
serverurl=http://127.0.0.1:${freePort}

[program:platforma]
depends_on=minio
command=${path.join(config.workingDir, 'binaries', plDirName, 'binaries', 'platforma')} --config ${config.plConfig.configPath}
directory=${config.workingDir}
autorestart=true

[program:minio]
environment=${minioEnvStr}
command=${path.join(config.workingDir, 'binaries', `${this.minioDirName}-${newArch(osInfo!.arch)}`, 'minio')} ${config.minioConfig.storageDir}
directory=${config.workingDir}
autorestart=true
`;
  }

  public async getFreePortForPlatformaOnServer(): Promise<number> {
    const binHomeDir = await this.getBinariesHomeDir();
    const freePortBin = path.join(binHomeDir, await this.getPlatformaDirName(), 'binaries', 'free-port');
    const { stdout, stderr } = await this.sshClient.exec(`${freePortBin}`);
    if (stderr) {
      throw new Error(stderr);
    }
    return +stdout;
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

// /** Does the following:
//  - opens ssh connection
//  - checks arch and OS of the remote server
//  - downloads pl backend and minio
//  - transfers them to the remote server
//  - finds free ports there
//  - generates config by the given ports
//  - transfers all required files and creates required dirs.
//  - starts Pl Backend and minio there. */
// export async function sshPlatformaInit(
//   logger: MiLogger,
//   sshClient: ssh.Client,
//   _ops: SshPlOptions,
// ): Promise<SshPl> {
//   // we'll trace all steps (or "state" of this platforma init process)
//   // in this context and print it
//   // if something goes wrong.
//   const ctx: {
//     ops?: SshPlOptions;
//     sshConnected?: boolean;
//   } = {};

//   try {
//     ctx.ops = {
//       plBinary: newDefaultPlBinarySource(),
//       ..._ops,
//     };

//     // opens ssh connection
//     await sshConnect(sshClient, ctx.ops.sshConfig);
//     ctx.sshConnected = true;

//     //

//     sshExec(sshClient, 'uname -s');

//     downloadPlBinary(logger, baseDir, plVersion, arch, platform);
//     //
//   } catch (e: any) {
//     logger.error(`sshPlatformaInit: something went wrong: ${e}, ctx: ${JSON.stringify(ctx)}`);
//   }
// }
