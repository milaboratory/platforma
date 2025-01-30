import type * as ssh from 'ssh2';
import { SshClient } from './ssh';
import type { MiLogger } from '@milaboratories/ts-helpers';
import { sleep, notEmpty, fileExists } from '@milaboratories/ts-helpers';
import type { DownloadBinaryResult } from '../common/pl_binary_download';
import { downloadBinaryNoExtract } from '../common/pl_binary_download';
import upath from 'upath';
import * as plpath from './pl_paths';
import { getDefaultPlVersion } from '../common/pl_version';

import net from 'net';
import type { SshPlConfigGenerationResult } from '@milaboratories/pl-config';
import { generateSshPlConfigs, getFreePort } from '@milaboratories/pl-config';
import { supervisorStatus, supervisorStop as supervisorCtlShutdown, generateSupervisordConfig, supervisorCtlStart } from './supervisord';

export class SshPl {
  private initState: PlatformaInitState = {};
  constructor(
    public readonly logger: MiLogger,
    public readonly sshClient: SshClient,
    private readonly username: string,
  ) {}

  public info() {
    return {
      username: this.username,
      initState: this.initState,
    };
  }

  public static async init(logger: MiLogger, config: ssh.ConnectConfig): Promise<SshPl> {
    try {
      const sshClient = await SshClient.init(logger, config);
      return new SshPl(logger, sshClient, notEmpty(config.username));
    } catch (e: unknown) {
      logger.error(`Connection error in SshClient.init: ${e}`);
      throw e;
    }
  }

  public async isAlive(): Promise<boolean> {
    const arch = await this.getArch();
    const remoteHome = await this.getUserHomeDirectory();

    try {
      return await supervisorStatus(this.logger, this.sshClient, remoteHome, arch.arch);
    } catch (e: unknown) {
      // probably there are no supervisor on the server.
      return false;
    }
  }

  public async start() {
    const arch = await this.getArch();
    const remoteHome = await this.getUserHomeDirectory();

    await supervisorCtlStart(this.sshClient, remoteHome, arch.arch);

    // We are waiting for Platforma to run to ensure that it has started.
    return await this.checkIsAliveWithInterval();
  }

  public async stop() {
    const arch = await this.getArch();
    const remoteHome = await this.getUserHomeDirectory();

    try {
      await supervisorCtlShutdown(this.sshClient, remoteHome, arch.arch);
      return await this.checkIsAliveWithInterval();
    } catch (e: unknown) {
      console.log(e);
      return false;
    }
  }

  public async platformaInit(localWorkdir: string): Promise<SshInitReturnTypes> {
    const state: PlatformaInitState = { localWorkdir };

    try {
      state.arch = await this.getArch();
      state.remoteHome = await this.getUserHomeDirectory();
      state.isAlive = await this.isAlive();

      if (state.isAlive) {
        state.userCredentials = await this.getUserCredentials(state.remoteHome);
        if (!state.userCredentials) {
          throw new Error(`SshPl.platformaInit: platforma is alive but userCredentials are not found`);
        }
        return state.userCredentials;
      }

      const downloadRes = await this.downloadBinariesAndUploadToTheServer(
        localWorkdir, state.remoteHome, state.arch,
      );
      state.binPaths = { ...downloadRes, history: undefined };
      state.downloadedBinaries = downloadRes.history;

      state.ports = await this.fetchPorts(state.remoteHome, state.arch);

      if (!state.ports.debug.remote || !state.ports.grpc.remote || !state.ports.minioPort.remote || !state.ports.minioConsolePort.remote || !state.ports.monitoring.remote) {
        throw new Error(`SshPl.platformaInit: remote ports are not defined`);
      }

      const config = await generateSshPlConfigs({
        logger: this.logger,
        workingDir: plpath.workDir(state.remoteHome),
        portsMode: {
          type: 'customWithMinio',
          ports: {
            debug: state.ports.debug.remote,
            grpc: state.ports.grpc.remote,
            minio: state.ports.minioPort.remote,
            minioConsole: state.ports.minioConsolePort.remote,
            monitoring: state.ports.monitoring.remote,

            grpcLocal: state.ports.grpc.local,
            minioLocal: state.ports.minioPort.local,
          },
        },
        licenseMode: {
          type: 'env',
        },
      });
      state.generatedConfig = { ...config, filesToCreate: { skipped: 'it is too wordy' } };

      for (const [filePath, content] of Object.entries(config.filesToCreate)) {
        await this.sshClient.writeFileOnTheServer(filePath, content);
        this.logger.info(`Created file ${filePath}`);
      }

      for (const dir of config.dirsToCreate) {
        await this.sshClient.createRemoteDirectory(dir);
        this.logger.info(`Created directory ${dir}`);
      }

      const supervisorConfig = generateSupervisordConfig(
        config.minioConfig.storageDir,
        config.minioConfig.envs,
        await this.getFreePortForPlatformaOnServer(state.remoteHome, state.arch),
        config.workingDir,
        config.plConfig.configPath,
        state.binPaths.minioRelPath,
        state.binPaths.downloadedPl,
      );

      const writeResult = await this.sshClient.writeFileOnTheServer(plpath.supervisorConf(state.remoteHome), supervisorConfig);
      if (!writeResult) {
        throw new Error(`Can not write supervisord config on the server ${plpath.workDir(state.remoteHome)}`);
      }

      state.connectionInfo = {
        plUser: config.plUser,
        plPassword: config.plPassword,
        ports: state.ports,
      };
      await this.sshClient.writeFileOnTheServer(
        plpath.connectionInfo(state.remoteHome),
        JSON.stringify(state.connectionInfo, undefined, 2),
      );

      await this.start();
      state.started = true;
      this.initState = state;

      return {
        plUser: config.plUser,
        plPassword: config.plPassword,
        ports: state.ports,
      };
    } catch (e: unknown) {
      const msg = `SshPl.platformaInit: error occurred: ${e}, state: ${JSON.stringify(state)}`;
      this.logger.error(msg);

      throw new Error(msg);
    }
  }

  public async downloadBinariesAndUploadToTheServer(
    localWorkdir: string,
    remoteHome: string,
    arch: Arch,
  ) {
    const state: DownloadAndUntarState[] = [];
    try {
      const pl = await this.downloadAndUntar(
        localWorkdir, remoteHome, arch,
        'pl', `pl-${getDefaultPlVersion()}`,
      );
      state.push(pl);

      const supervisor = await this.downloadAndUntar(
        localWorkdir, remoteHome, arch,
        'supervisord', plpath.supervisordDirName,
      );
      state.push(supervisor);

      const minioPath = plpath.minioBin(remoteHome, arch.arch);
      const minio = await this.downloadAndUntar(
        localWorkdir, remoteHome, arch,
        'minio', plpath.minioDirName,
      );
      state.push(minio);
      await this.sshClient.chmod(minioPath, 0o750);

      return {
        history: state,
        minioRelPath: minioPath,
        downloadedPl: plpath.platformaBin(remoteHome, arch.arch),
      };
    } catch (e: unknown) {
      const msg = `SshPl.downloadBinariesAndUploadToServer: error ${e} occurred, state: ${JSON.stringify(state)}`;
      this.logger.error(msg);
      throw e;
    }
  }

  public async downloadAndUntar(
    localWorkdir: string,
    remoteHome: string,
    arch: Arch,
    softwareName: string,
    tgzName: string,
  ): Promise<DownloadAndUntarState> {
    // we have to extract pl in the remote server,
    // because Windows doesn't support symlinks
    // that are found in linux pl binaries tgz archive.
    // For this reason, we extract all to the remote server.

    const state: DownloadAndUntarState = {};
    state.binBasePath = plpath.binariesDir(remoteHome);
    await this.sshClient.createRemoteDirectory(state.binBasePath);
    state.binBasePathCreated = true;

    state.downloadResult = await downloadBinaryNoExtract(
      this.logger,
      localWorkdir,
      softwareName,
      tgzName,
      arch.arch, arch.platform,
    );

    state.localArchivePath = upath.resolve(state.downloadResult.archivePath);
    state.remoteDir = upath.join(state.binBasePath, state.downloadResult.baseName);
    state.remoteArchivePath = state.remoteDir + '.tgz';

    await this.sshClient.createRemoteDirectory(state.remoteDir);
    await this.sshClient.uploadFile(state.localArchivePath, state.remoteArchivePath);

    const untarResult = await this.sshClient.exec(
      `tar xvf ${state.remoteArchivePath} --directory=${state.remoteDir}`,
    );
    if (untarResult.stderr)
      throw new Error(`downloadAndUntar: untar: stderr occurred: ${untarResult.stderr}, stdout: ${untarResult.stdout}`);

    state.plUntarDone = true;

    return state;
  }

  public async needDownload(remoteHome: string, arch: Arch) {
    const checkPathSupervisor = plpath.supervisorBin(remoteHome, arch.arch);
    const checkPathMinio = plpath.minioDir(remoteHome, arch.arch);
    const checkPathPlatforma = plpath.platformaBin(remoteHome, arch.arch);

    if (!await this.sshClient.checkFileExists(checkPathPlatforma)
      || !await this.sshClient.checkFileExists(checkPathMinio)
      || !await this.sshClient.checkFileExists(checkPathSupervisor)) {
      return true;
    }

    return false;
  }

  public async checkIsAliveWithInterval(interval: number = 1000, count = 15) {
    const maxMs = count * interval;

    let total = 0;
    while (!(await this.isAlive())) {
      await sleep(interval);
      total += interval;
      if (total > maxMs) {
        throw new Error(`isAliveWithInterval: The process did not stopped after ${maxMs} ms.`);
      }
    }
  }

  public async getUserCredentials(remoteHome: string): Promise<SshInitReturnTypes> {
    const connectionInfo = await this.sshClient.readFile(plpath.connectionInfo(remoteHome));
    return JSON.parse(connectionInfo) as SshInitReturnTypes;
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

  public async getLocalFreePort(): Promise<number> {
    return new Promise((res) => {
      const srv = net.createServer();
      srv.listen(0, () => {
        const port = (srv.address() as net.AddressInfo).port;
        srv.close((_) => res(port));
      });
    });
  }

  public async getFreePortForPlatformaOnServer(remoteHome: string, arch: Arch): Promise<number> {
    const freePortBin = plpath.platformaFreePortBin(remoteHome, arch.arch);

    const { stdout, stderr } = await this.sshClient.exec(`${freePortBin}`);
    if (stderr) {
      throw new Error(`getFreePortForPlatformaOnServer: stderr is not empty: ${stderr}, stdout: ${stdout}`);
    }

    return +stdout;
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

export type SshPlatformaPorts = {
  grpc: {
    local: number;
    remote: number;
  };
  monitoring: {
    local: number;
    remote: number;
  };
  debug: {
    local: number;
    remote: number;
  };
  minioPort: {
    local: number;
    remote: number;
  };
  minioConsolePort: {
    local: number;
    remote: number;
  };
};

type Arch = { platform: string; arch: string };

export type SshInitReturnTypes = {
  plUser: string;
  plPassword: string;
  ports: SshPlatformaPorts;
} | null;

type BinPaths = {
  history?: DownloadAndUntarState[];
  minioRelPath: string;
  downloadedPl: any;
};

type DownloadAndUntarState = {
  binBasePath?: string;
  binBasePathCreated?: boolean;
  downloadResult?: DownloadBinaryResult;

  localArchivePath?: string;
  remoteDir?: string;
  remoteArchivePath?: string;
  plUploadDone?: boolean;
  plUntarDone?: boolean;
};

type PlatformaInitState = {
  localWorkdir?: string;
  arch?: Arch;
  remoteHome?: string;
  isAlive?: boolean;
  userCredentials?: SshInitReturnTypes;
  downloadedBinaries?: DownloadAndUntarState[];
  binPaths?: BinPaths;
  ports?: SshPlatformaPorts;
  generatedConfig?: SshPlConfigGenerationResult;
  connectionInfo?: SshInitReturnTypes;
  started?: boolean;
};
