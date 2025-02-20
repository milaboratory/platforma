import type * as ssh from 'ssh2';
import { SshClient } from './ssh';
import type { MiLogger } from '@milaboratories/ts-helpers';
import { sleep, notEmpty } from '@milaboratories/ts-helpers';
import type { DownloadBinaryResult } from '../common/pl_binary_download';
import { downloadBinaryNoExtract } from '../common/pl_binary_download';
import upath from 'upath';
import * as plpath from './pl_paths';
import { getDefaultPlVersion } from '../common/pl_version';

import net from 'net';
import type { PlLicenseMode, SshPlConfigGenerationResult } from '@milaboratories/pl-config';
import { generateSshPlConfigs, getFreePort } from '@milaboratories/pl-config';
import type { SupervisorStatus } from './supervisord';
import { supervisorStatus, supervisorStop as supervisorCtlShutdown, generateSupervisordConfig, supervisorCtlStart } from './supervisord';
import type { ConnectionInfo, SshPlPorts } from './connection_info';
import { newConnectionInfo, parseConnectionInfo, stringifyConnectionInfo } from './connection_info';
import type { PlBinarySourceDownload } from '../common/pl_binary';

export class SshPl {
  private initState: PlatformaInitState = {};
  constructor(
    public readonly logger: MiLogger,
    public readonly sshClient: SshClient,
    private readonly username: string,
  ) { }

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

  public cleanUp() {
    this.sshClient.close();
  }

  /** Provides an info if the platforma and minio are running along with the debug info. */
  public async isAlive(): Promise<SupervisorStatus> {
    const arch = await this.getArch();
    const remoteHome = await this.getUserHomeDirectory();
    return await supervisorStatus(this.logger, this.sshClient, remoteHome, arch.arch);
  }

  /** Starts all the services on the server.
    * Idempotent semantic: we could call it several times. */
  public async start() {
    const arch = await this.getArch();
    const remoteHome = await this.getUserHomeDirectory();

    try {
      if (!(await this.isAlive()).allAlive) {
        await supervisorCtlStart(this.sshClient, remoteHome, arch.arch);

        // We are waiting for Platforma to run to ensure that it has started.
        return await this.checkIsAliveWithInterval();
      }
    } catch (e: unknown) {
      const msg = `SshPl.start: error occurred ${e}`;
      this.logger.error(msg);
      throw new Error(msg);
    }
  }

  /** Stops all the services on the server.
    * Idempotent semantic: we could call it several times. */
  public async stop() {
    const arch = await this.getArch();
    const remoteHome = await this.getUserHomeDirectory();

    try {
      if ((await this.isAlive()).allAlive) {
        await supervisorCtlShutdown(this.sshClient, remoteHome, arch.arch);
        return await this.checkIsAliveWithInterval(undefined, undefined, false);
      }
    } catch (e: unknown) {
      const msg = `PlSsh.stop: error occurred ${e}`;
      this.logger.error(msg);
      throw new Error(msg);
    }
  }

  /** Stops the services, deletes a directory with the state and closes SSH connection. */
  public async reset(): Promise<boolean> {
    await this.stopAndClean();
    this.cleanUp();
    return true;
  }

  /** Stops platforma and deletes its state. */
  public async stopAndClean(): Promise<void> {
    const remoteHome = await this.getUserHomeDirectory();

    this.logger.info(`pl.reset: Stop Platforma on the server`);
    await this.stop();

    this.logger.info(`pl.reset: Deleting Platforma workDir ${plpath.workDir(remoteHome)} on the server`);
    await this.sshClient.deleteFolder(plpath.workDir(remoteHome));
  }

  /** Downloads binaries and untar them on the server,
   * generates all the configs, creates necessary dirs,
   * and finally starts all the services. */
  public async platformaInit(options: SshPlConfig): Promise<ConnectionInfo> {
    const state: PlatformaInitState = { localWorkdir: options.localWorkdir };

    try {
      // merge options with default ops.
      const ops: SshPlConfig = {
        ...defaultSshPlConfig,
        ...options,
      };
      state.plBinaryOps = ops.plBinary;
      state.arch = await this.getArch();
      state.remoteHome = await this.getUserHomeDirectory();
      state.alive = await this.isAlive();

      if (state.alive.allAlive) {
        state.userCredentials = await this.getUserCredentials(state.remoteHome);
        if (!state.userCredentials) {
          throw new Error(`SshPl.platformaInit: platforma is alive but userCredentials are not found`);
        }
        const sameGA = state.userCredentials.useGlobalAccess == ops.useGlobalAccess;
        const samePlVersion = state.userCredentials.plVersion == ops.plBinary!.version;
        state.needRestart = !(sameGA && samePlVersion);
        this.logger.info(`SshPl.platformaInit: need restart? ${state.needRestart}`);

        if (!state.needRestart)
          return state.userCredentials;

        await this.stop();
      }

      const downloadRes = await this.downloadBinariesAndUploadToTheServer(
        ops.localWorkdir, ops.plBinary!, state.remoteHome, state.arch,
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
        licenseMode: ops.license,
        useGlobalAccess: notEmpty(ops.useGlobalAccess),
      });
      state.generatedConfig = { ...config, filesToCreate: { skipped: 'it is too wordy' } };

      for (const [filePath, content] of Object.entries(config.filesToCreate)) {
        await this.sshClient.writeFileOnTheServer(filePath, content);
        this.logger.info(`Created file ${filePath}`);
      }

      for (const dir of config.dirsToCreate) {
        await this.sshClient.ensureRemoteDirCreated(dir);
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

      state.connectionInfo = newConnectionInfo(
        config.plUser,
        config.plPassword,
        state.ports,
        notEmpty(ops.useGlobalAccess),
        ops.plBinary!.version,
      );
      await this.sshClient.writeFileOnTheServer(
        plpath.connectionInfo(state.remoteHome),
        stringifyConnectionInfo(state.connectionInfo),
      );

      await this.start();
      state.started = true;
      this.initState = state;

      return state.connectionInfo;
    } catch (e: unknown) {
      const msg = `SshPl.platformaInit: error occurred: ${e}, state: ${JSON.stringify(state)}`;
      this.logger.error(msg);

      throw new Error(msg);
    }
  }

  public async downloadBinariesAndUploadToTheServer(
    localWorkdir: string,
    plBinary: PlBinarySourceDownload,
    remoteHome: string,
    arch: Arch,
  ) {
    const state: DownloadAndUntarState[] = [];
    try {
      const pl = await this.downloadAndUntar(
        localWorkdir, remoteHome, arch,
        'pl', `pl-${plBinary.version}`,
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

  /** We have to extract pl in the remote server,
  * because Windows doesn't support symlinks
  * that are found in Linux pl binaries tgz archive.
  * For this reason, we extract all to the remote server.
  * It requires `tar` to be installed on the server
  * (it's not installed for Rocky Linux for example). */
  public async downloadAndUntar(
    localWorkdir: string,
    remoteHome: string,
    arch: Arch,
    softwareName: string,
    tgzName: string,
  ): Promise<DownloadAndUntarState> {
    const state: DownloadAndUntarState = {};
    state.binBasePath = plpath.binariesDir(remoteHome);
    await this.sshClient.ensureRemoteDirCreated(state.binBasePath);
    state.binBasePathCreated = true;

    let downloadBinaryResult: DownloadBinaryResult | null = null;
    const attempts = 5;
    for (let i = 1; i <= attempts; i++) {
      try {
        downloadBinaryResult = await downloadBinaryNoExtract(
          this.logger,
          localWorkdir,
          softwareName,
          tgzName,
          arch.arch, arch.platform,
        );
        break;
      } catch (e: unknown) {
        await sleep(300);
        if (i == attempts) {
          throw new Error(`downloadAndUntar: ${attempts} attempts, last error: ${e}`);
        }
      }
    }
    state.downloadResult = notEmpty(downloadBinaryResult);

    state.localArchivePath = upath.resolve(state.downloadResult.archivePath);
    state.remoteDir = upath.join(state.binBasePath, state.downloadResult.baseName);
    state.remoteArchivePath = state.remoteDir + '.tgz';

    await this.sshClient.ensureRemoteDirCreated(state.remoteDir);
    await this.sshClient.uploadFile(state.localArchivePath, state.remoteArchivePath);
    state.uploadDone = true;

    // TODO: Create a proper archive to avoid xattr warnings
    const untarResult = await this.sshClient.exec(
      `tar --warning=no-all -xvf ${state.remoteArchivePath} --directory=${state.remoteDir}`,
    );

    if (untarResult.stderr)
      throw Error(`downloadAndUntar: untar: stderr occurred: ${untarResult.stderr}, stdout: ${untarResult.stdout}`);

    state.untarDone = true;

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

  public async checkIsAliveWithInterval(interval: number = 1000, count = 15, shouldStart = true): Promise<void> {
    const maxMs = count * interval;

    let total = 0;
    let alive = await this.isAlive();
    while (shouldStart ? !alive.allAlive : alive.allAlive) {
      await sleep(interval);
      total += interval;
      if (total > maxMs) {
        throw new Error(`isAliveWithInterval: The process did not ${shouldStart ? 'started' : 'stopped'} after ${maxMs} ms. Live status: ${JSON.stringify(alive)}`);
      }
      alive = await this.isAlive();
    }
  }

  public async getUserCredentials(remoteHome: string): Promise<ConnectionInfo> {
    const connectionInfo = await this.sshClient.readFile(plpath.connectionInfo(remoteHome));
    return parseConnectionInfo(connectionInfo);
  }

  public async fetchPorts(remoteHome: string, arch: Arch): Promise<SshPlPorts> {
    const ports: SshPlPorts = {
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

type Arch = { platform: string; arch: string };

export type SshPlConfig = {
  localWorkdir: string;
  license: PlLicenseMode;
  useGlobalAccess?: boolean;
  plBinary?: PlBinarySourceDownload;
};

const defaultSshPlConfig: Pick<
  SshPlConfig,
  | 'useGlobalAccess'
  | 'plBinary'
> = {
  useGlobalAccess: false,
  plBinary: {
    type: 'Download',
    version: getDefaultPlVersion(),
  },
};

type BinPaths = {
  history?: DownloadAndUntarState[];
  minioRelPath: string;
  downloadedPl: string;
};

type DownloadAndUntarState = {
  binBasePath?: string;
  binBasePathCreated?: boolean;
  downloadResult?: DownloadBinaryResult;
  attempts?: number;

  localArchivePath?: string;
  remoteDir?: string;
  remoteArchivePath?: string;
  uploadDone?: boolean;
  untarDone?: boolean;
};

type PlatformaInitState = {
  localWorkdir?: string;
  plBinaryOps?: PlBinarySourceDownload;
  arch?: Arch;
  remoteHome?: string;
  alive?: SupervisorStatus;
  userCredentials?: ConnectionInfo;
  needRestart?: boolean;
  downloadedBinaries?: DownloadAndUntarState[];
  binPaths?: BinPaths;
  ports?: SshPlPorts;
  generatedConfig?: SshPlConfigGenerationResult;
  connectionInfo?: ConnectionInfo;
  started?: boolean;
};
