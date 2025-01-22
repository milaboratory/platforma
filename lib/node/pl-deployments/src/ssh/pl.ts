import type * as ssh from 'ssh2';
import { SshClient } from './ssh';
import { ConsoleLoggerAdapter } from '@milaboratories/ts-helpers';
import { downloadBinary, downloadPlBinary } from '../common/pl_binary_download';
import path from 'path';
import { getDefaultPlVersion } from '../common/pl_version';
import { newArch } from '../common/os_and_arch';
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

export type SshInitReturnTypes = {
  plUser: string;
  plPassword: string;
  ports: SshPlatformaPorts;
} | null;

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

  public async isAlive(): Promise<boolean> {
    const isProgramRunning = (output: string, programName: string) => {
      // eslint-disable-next-line no-control-regex
      const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*m/g, '');
      const cleanedOutput = stripAnsi(output);
      return cleanedOutput.split('\n').some((line) => {
        const [name, status] = line.trim().split(/\s{2,}/); // Разделяем строку по 2+ пробелам
        return name === programName && status === 'Running';
      });
    };

    try {
      const cmd = `${await this.getSupervisorBinDirOnServer()}/supervisord --configuration ${await this.getSupervisorConfOnServer()} ctl status`;
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

  public async fetchPorts(): Promise<SshPlatformaPorts> {
    const ports: SshPlatformaPorts = {
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

    return ports;
  }

  public async downloadPlatformaBinaries(dirname: string) {
    const platformInfo = await this.getArch();
    if (platformInfo) {
      const result = downloadPlBinary(new ConsoleLoggerAdapter(), dirname, getDefaultPlVersion(), platformInfo?.arch, platformInfo?.platform);
      return result;
    }
    return null;
  }

  public async getPlatformaRemoteWorkingDir() {
    return [await this.sshClient.getUserHomeDirectory(), 'platforma_ssh'].join('/');
  }

  public async getBinariesHomeDir() {
    return [await this.sshClient.getUserHomeDirectory(), 'platforma_ssh/binaries'].join('/');
  }

  public async getSupervisorBinDirOnServer() {
    // FIXME Coordinate the paths
    return [await this.getBinariesHomeDir(), 'supervisord-0.7.3-amd64', this.supervisordSubDirName].join('/');
  }

  public async getMinioBinDirOnServer() {
    // FIXME Coordinate the paths
    return [await this.getBinariesHomeDir(), 'minio-2024-12-18T13-15-44Z-amd64'].join('/');
  }

  public async getPlatformaBinDirOnTheServer() {
    return [await this.getBinariesHomeDir(), await this.getPlatformaDirName(), 'binaries'].join('/');
  }

  public async getSupervisorConfOnServer() {
    return [await this.getPlatformaRemoteWorkingDir(), 'supervisor.conf'].join('/');
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

  public async downloadBinariesAndUploadToTheServer(plWorkingDirname: string) {
    await this.stop();

    const platformInfo = await this.getArch();
    const supervisordSoftwareName = 'supervisord';
    const minioSoftwareName = 'minio';

    const downloadedPl = await this.downloadPlatformaBinaries(plWorkingDirname);

    const supervisordDirInfo = await downloadBinary(
      new ConsoleLoggerAdapter(),
      plWorkingDirname,
      supervisordSoftwareName,
      this.supervisordDirName,
      platformInfo!.arch,
      platformInfo!.platform,
    );

    const minioDirInfo = await downloadBinary(
      new ConsoleLoggerAdapter(),
      plWorkingDirname,
      minioSoftwareName,
      this.minioDirName,
      platformInfo!.arch,
      platformInfo!.platform,
    );
    const minioRelPath = `${minioDirInfo.dirBaseName}/minio`;

    const binBasePath = await this.getBinariesHomeDir();
    await this.sshClient.createRemoteDirectory(binBasePath);
    const binDirs = [
      path.basename(downloadedPl!.archivePath),
      path.basename(supervisordDirInfo.dir!),
      path.basename(minioDirInfo.dir!),
    ];

    for (const dir of binDirs) {
      await this.sshClient.uploadDirectory(
        path.resolve(plWorkingDirname, dir),
        path.resolve(binBasePath, dir),
        0o760,
      );
    }
    return { minioRelPath, downloadedPl };
  }

  public async needDownload() {
    const checkPathSupervisor = `${await this.getSupervisorBinDirOnServer()}/supervisord`;
    const checkPathMinio = `${await this.getMinioBinDirOnServer()}/minio`;
    const checkPathPlatforma = `${await this.getPlatformaBinDirOnTheServer()}/platforma`;

    if (!await this.sshClient.checkFileExists(checkPathPlatforma)
      || !await this.sshClient.checkFileExists(checkPathMinio)
      || !await this.sshClient.checkFileExists(checkPathSupervisor)) {
      return true;
    }

    return false;
  }

  public async getUserCredentials(): Promise<SshInitReturnTypes> {
    const connectionInfo = await this.sshClient.readFile(await this.getConnectionFilePath());
    return JSON.parse(connectionInfo) as SshInitReturnTypes;
  }

  public async getConnectionFilePath() {
    return `${await this.getPlatformaRemoteWorkingDir()}/connection.txt`;
  }

  public async platformaInit(plWorkingDirname: string): Promise<SshInitReturnTypes> {
    try {
      const isAlive = await this.isAlive();

      if (isAlive) {
        const userCredentials = await this.getUserCredentials();
        if (!userCredentials) {
          return null;
        }
        return userCredentials;
      }

      const binPaths = await this.downloadBinariesAndUploadToTheServer(plWorkingDirname);

      const ports = await this.fetchPorts();

      if (!ports.debug.remote || !ports.grpc.remote || !ports.minioPort.remote || !ports.minioConsolePort.remote || !ports.monitoring.remote) {
        return null;
      }

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

      for (const [filePath, content] of Object.entries(config.filesToCreate)) {
        await this.sshClient.writeFileOnTheServer(filePath, content);
        console.log(`Created file ${filePath}`);
      }

      for (const dir of config.dirsToCreate) {
        await this.sshClient.createRemoteDirectory(dir);
        console.log(`Created directory ${dir}`);
      }

      const supervisorConfig = await this.generateSupervisordConfig(config, binPaths.minioRelPath, binPaths.downloadedPl!.binaryPath);

      const writeResult = await this.sshClient.writeFileOnTheServer(await this.getSupervisorConfOnServer(), supervisorConfig);
      if (!writeResult) {
        console.error(`Can not write supervisord config on the server ${await this.getPlatformaRemoteWorkingDir()}`);
      }

      await this.sshClient.writeFileOnTheServer(
        await this.getConnectionFilePath(),
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

  public async generateSupervisordConfig(config: SshPlConfigGenerationResult, minioPath: string, plPath: string) {
    const minioEnvStr = Object.entries(config.minioConfig.envs).map(([key, value]) => `${key}="${value}"`).join(',');
    const password = randomBytes(16).toString('hex');
    const freePort = await this.getFreePortForPlatformaOnServer();

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

  public async getFreePortForPlatformaOnServer(): Promise<number> {
    const binHomeDir = await this.getBinariesHomeDir();
    const freePortBin = [binHomeDir, await this.getPlatformaDirName(), 'binaries', 'free-port'].join('/');
    const { stdout, stderr } = await this.sshClient.exec(`${freePortBin}`);
    if (stderr) {
      console.error(`CMD ${freePortBin}`);
      throw new Error(stderr);
    }
    return +stdout;
  }

  public async start() {
    const command = `${path.join(await this.getSupervisorBinDirOnServer(), 'supervisord')} --configuration ${await this.getSupervisorConfOnServer()} --daemon`;
    const runSupervisord = await this.sshClient.exec(command);
    if (runSupervisord.stderr) {
      throw new Error(`Can not run ssh Platforma ${runSupervisord.stderr}`);
    }
    // We are waiting for Platforma to run to ensure that it has started.
    return await this.checkIsAliveWithInteval();
  }

  public async stop() {
    try {
      const command = `${path.join(await this.getSupervisorBinDirOnServer(), 'supervisord')} --configuration ${await this.getSupervisorConfOnServer()} ctl shutdown`;
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
}
