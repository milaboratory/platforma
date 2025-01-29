import type * as ssh from 'ssh2';
import { SshClient } from './ssh';
import { ConsoleLoggerAdapter, MiLogger, notEmpty } from '@milaboratories/ts-helpers';
import { downloadBinary, downloadPlBinary } from '../common/pl_binary_download';
import upath from 'upath';
import * as plpath from './pl_paths';
import { getDefaultPlVersion } from '../common/pl_version';

import net from 'net';
import type { SshPlConfigGenerationResult } from '@milaboratories/pl-config';
import { generateSshPlConfigs, getFreePort } from '@milaboratories/pl-config';
import { randomBytes } from 'crypto';

export type SshPlatformaPorts = {
  grpc: {
    local: number;
    remote: number ;
  };
  monitoring: {
    local: number;
    remote: number ;
  };
  debug: {
    local: number;
    remote: number ;
  };
  minioPort: {
    local: number;
    remote: number ;
  };
  minioConsolePort: {
    local: number;
    remote: number ;
  };
};

type Arch = { platform: string; arch: string };

export type SshInitReturnTypes = {
  plUser: string;
  plPassword: string;
  ports: SshPlatformaPorts;
} | null;

export class SshPl {

  constructor(
    private readonly logger: MiLogger,
    public readonly sshClient: SshClient,
    private readonly username: string,
  ) {}

  public static async init(logger: MiLogger, config: ssh.ConnectConfig): Promise<SshPl> {
    try {
      const sshClient = await SshClient.init(config);
      return new SshPl(logger, sshClient, notEmpty(config.username));
    } catch (e: unknown) {
      logger.error(`Connection error in SshClient.init: ${e}`);
      throw e;
    }
  }

  public async isAlive(): Promise<boolean> {
    const arch = await this.getArch();
    const remoteHome = await this.getUserHomeDirectory();

    const isProgramRunning = (output: string, programName: string) => {
      // eslint-disable-next-line no-control-regex
      const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*m/g, '');
      const cleanedOutput = stripAnsi(output);
      return cleanedOutput.split('\n').some((line) => {
        const [name, status] = line.trim().split(/\s{2,}/); // Split string by 2 spaces.
        return name === programName && status === 'Running';
      });
    };

    try {
      const cmd = `${plpath.getSupervisorBinDirOnServer(remoteHome, arch.arch)}/supervisord --configuration ${plpath.getSupervisorConfOnServer(remoteHome)} ctl status`;
      const result = await this.sshClient.exec(cmd);

      if (result.stderr) {
        console.log(result.stderr);
        return false;
      }

      if (isProgramRunning(result.stdout, 'minio') && isProgramRunning(result.stdout, 'platforma')) {
        return true;
      }

      if (!isProgramRunning(result.stdout, 'minio')) {
        console.error('Minio not running on the server');
      }

      if (!isProgramRunning(result.stdout, 'platforma')) {
        console.error('Platforma not running on the server');
      }

      return false;
    } catch (e: unknown) {
      console.log(e);
      return false;
    }
  }

  public async fetchPorts(remoteHome: string, arch: Arch): Promise<SshPlatformaPorts> {
    const ports: SshPlatformaPorts = {
      grpc: {
        local: await getFreePort(),
        remote: await this.getFreePortForPlatformaOnServer(remoteHome, arch),
      },
      monitoring: {
        local: await getFreePort(),
        remote: await this.getFreePortForPlatformaOnServer(remoteHome, arch),
      },
      debug: {
        local: await getFreePort(),
        remote: await this.getFreePortForPlatformaOnServer(remoteHome, arch),
      },
      minioPort: {
        local: await getFreePort(),
        remote: await this.getFreePortForPlatformaOnServer(remoteHome, arch),
      },
      minioConsolePort: {
        local: await getFreePort(),
        remote: await this.getFreePortForPlatformaOnServer(remoteHome, arch),
      },
    };

    return ports;
  }

  public async downloadPlatformaBinaries(platformInfo: Arch, dirname: string) {
    if (platformInfo) {
      const result = downloadPlBinary(new ConsoleLoggerAdapter(), dirname, getDefaultPlVersion(), platformInfo?.arch, platformInfo?.platform);
      return result;
    }
    return null;
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

  public async downloadBinariesAndUploadToTheServer(localWorkdir: string, remoteHome: string, arch: Arch) {
    await this.stop();

    // const platformInfo = await this.getArch();
    const supervisordSoftwareName = 'supervisord';
    const minioSoftwareName = 'minio';

    const downloadedPl = await this.downloadPlatformaBinaries(arch, localWorkdir);

    const supervisordDirInfo = await downloadBinary(
      new ConsoleLoggerAdapter(),
      localWorkdir,
      supervisordSoftwareName,
      plpath.supervisordDirName,
      arch!.arch,
      arch!.platform,
    );

    const minioDirInfo = await downloadBinary(
      new ConsoleLoggerAdapter(),
      localWorkdir,
      minioSoftwareName,
      plpath.minioDirName,
      arch!.arch,
      arch!.platform,
    );
    const minioRelPath = `${minioDirInfo.dirBaseName}/minio`;

    const binBasePath = plpath.binariesDir(remoteHome);
    await this.sshClient.createRemoteDirectory(binBasePath);
    const binDirs = [
      upath.basename(downloadedPl!.archivePath),
      upath.basename(supervisordDirInfo.dir!),
      upath.basename(minioDirInfo.dir!),
    ];

    for (const dir of binDirs) {
      await this.sshClient.uploadDirectory(
        upath.resolve(localWorkdir, dir),
        upath.resolve(binBasePath, dir),
        0o760,
      );
    }
    return { minioRelPath, downloadedPl };
  }

  public async needDownload(remoteHome: string, arch: Arch) {
    const checkPathSupervisor = `${plpath.getSupervisorBinDirOnServer(remoteHome, arch.arch)}/supervisord`;
    const checkPathMinio = plpath.minioDir(remoteHome, arch.arch);
    const checkPathPlatforma = `${plpath.platformaDir(remoteHome, arch.arch)}/platforma`;

    if (!await this.sshClient.checkFileExists(checkPathPlatforma)
      || !await this.sshClient.checkFileExists(checkPathMinio)
      || !await this.sshClient.checkFileExists(checkPathSupervisor)) {
      return true;
    }

    return false;
  }

  public async getUserCredentials(remoteHome: string): Promise<SshInitReturnTypes> {
    const connectionInfo = await this.sshClient.readFile(plpath.getConnectionFilePath(remoteHome));
    return JSON.parse(connectionInfo) as SshInitReturnTypes;
  }

  public async platformaInit(localWorkdir: string): Promise<SshInitReturnTypes> {
    const arch = await this.getArch();
    const remoteHome = await this.getUserHomeDirectory();

    try {
      const isAlive = await this.isAlive();

      if (isAlive) {
        const userCredentials = await this.getUserCredentials(remoteHome);
        if (!userCredentials) {
          return null;
        }
        return userCredentials;
      }

      const binPaths = await this.downloadBinariesAndUploadToTheServer(localWorkdir, remoteHome, arch);

      const ports = await this.fetchPorts(remoteHome, arch);

      if (!ports.debug.remote || !ports.grpc.remote || !ports.minioPort.remote || !ports.minioConsolePort.remote || !ports.monitoring.remote) {
        return null;
      }

      const config = await generateSshPlConfigs({
        logger: new ConsoleLoggerAdapter(),
        workingDir: plpath.getPlatformaRemoteWorkingDir(remoteHome),
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

      for (const [filePath, content] of Object.entries(config.filesToCreate)) {
        await this.sshClient.writeFileOnTheServer(filePath, content);
        console.log(`Created file ${filePath}`);
      }

      for (const dir of config.dirsToCreate) {
        await this.sshClient.createRemoteDirectory(dir);
        console.log(`Created directory ${dir}`);
      }

      const supervisorConfig = await this.generateSupervisordConfig(remoteHome, arch, config, binPaths.minioRelPath, binPaths.downloadedPl!.binaryPath);

      const writeResult = await this.sshClient.writeFileOnTheServer(plpath.getSupervisorConfOnServer(remoteHome), supervisorConfig);
      if (!writeResult) {
        console.error(`Can not write supervisord config on the server ${plpath.getPlatformaRemoteWorkingDir(remoteHome)}`);
      }

      await this.sshClient.writeFileOnTheServer(
        plpath.getConnectionFilePath(remoteHome),
        JSON.stringify({
          plUser: config.plUser,
          plPassword: config.plPassword,
          ports: ports,
        }, undefined, 2),
      );

      await this.start();

      return {
        plUser: config.plUser,
        plPassword: config.plPassword,
        ports,
      };
    } catch (e: unknown) {
      return null;
    }
  }

  public async checkIsAliveWithInteval(interval: number = 1000, count: number = 15) {
    let intervalId: NodeJS.Timeout;
    let iteration = 0;
    return new Promise((resolve, reject) => {
      intervalId = setInterval(async () => {
        try {
          if (iteration >= count) {
            clearInterval(intervalId);
            resolve(false);
            return;
          }
          iteration++;
          const result = await this.isAlive();
          if (result) {
            clearInterval(intervalId);
            resolve(true);
            return;
          }
        } catch (e: unknown) {
          clearInterval(intervalId);
          reject(e);
          return;
        }
      }, interval);

      (async () => {
        try {
          const initialResult = await this.isAlive();
          if (initialResult) {
            clearInterval(intervalId);
            resolve(true);
          }
        } catch (e: unknown) {
          clearInterval(intervalId);
          reject(e);
        }
      })();
    });
  }

  public async generateSupervisordConfig(
    homeDir: string,
    arch: Arch,
    config: SshPlConfigGenerationResult,
    minioPath: string,
    plPath: string,
  ) {
    const minioEnvStr = Object.entries(config.minioConfig.envs).map(([key, value]) => `${key}="${value}"`).join(',');
    const password = randomBytes(16).toString('hex');
    const freePort = await this.getFreePortForPlatformaOnServer(homeDir, arch);

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
username=default-user
password=${password}

[program:platforma]
depends_on=minio
command=binaries/${plPath} --config ${config.plConfig.configPath}
directory=${config.workingDir}
autorestart=true

[program:minio]
environment=${minioEnvStr}
command=binaries/${minioPath} server ${config.minioConfig.storageDir}
directory=${config.workingDir}
autorestart=true
`;
  }

  public async getFreePortForPlatformaOnServer(remoteHome: string, arch: Arch): Promise<number> {
    const binHomeDir = plpath.binariesDir(remoteHome);
    const freePortBin = upath.join(binHomeDir, plpath.platformaBaseDir(arch.arch), 'binaries', 'free-port');
    const { stdout, stderr } = await this.sshClient.exec(`${freePortBin}`);
    if (stderr) {
      console.error(`CMD ${freePortBin}`);
      throw new Error(stderr);
    }
    return +stdout;
  }

  public async start() {
    const arch = await this.getArch();
    const remoteHome = await this.getUserHomeDirectory();

    const supervisordCmd = upath.join(plpath.getSupervisorBinDirOnServer(remoteHome, arch.arch), 'supervisord');
    const supervisorConf = plpath.getSupervisorConfOnServer(remoteHome);
    const command = `${supervisordCmd} --configuration ${supervisorConf} --daemon`;

    const runSupervisord = await this.sshClient.exec(command);
    if (runSupervisord.stderr) {
      throw new Error(`Can not run ssh Platforma ${runSupervisord.stderr}`);
    }
    // We are waiting for Platforma to run to ensure that it has started.
    return await this.checkIsAliveWithInteval();
  }

  public async stop() {
    const arch = await this.getArch();
    const remoteHome = await this.getUserHomeDirectory();

    try {
      const supervisorCmd = upath.join(plpath.getSupervisorBinDirOnServer(remoteHome, arch.arch), 'supervisord');
      const supervisorConf = plpath.getSupervisorConfOnServer(remoteHome);

      const command = `${supervisorCmd} --configuration ${supervisorConf} ctl shutdown`;
      const runSupervisord = await this.sshClient.exec(command);
      if (runSupervisord.stderr) {
        throw new Error(`Can not stop ssh Platforma ${runSupervisord.stderr}`);
      }
      return await this.checkIsAliveWithInteval(undefined, 5);
    } catch (e: unknown) {
      console.log(e);
      return false;
    }
  }

  public async getArch(): Promise<Arch> {
    const { stdout, stderr } = await this.sshClient.exec('uname -s && uname -m');
    if (stderr)
      throw new Error(`getArch: stderr is not empty: ${stderr}, stdout: ${stdout}`);

    const arr = stdout.split('\n');

    return {
      platform: arr[0],
      arch: arr[1],
    };
  }

  public async getUserHomeDirectory() {
    const { stdout, stderr } = await this.sshClient.exec('echo $HOME');

    if (stderr) {
      const home = `/home/${this.username}`;
      console.warn(`getUserHomeDirectory: stderr is not empty: ${stderr}, stdout: ${stdout}, will get a default home: ${home}`);

      return home;
    }

    return stdout.trim();
  }
}
