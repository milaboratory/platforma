import type * as ssh from 'ssh2';
import { SshClient } from './ssh';
import type { MiLogger } from '@milaboratories/ts-helpers';
import { sleep, notEmpty } from '@milaboratories/ts-helpers';
import type { DownloadBinaryResult } from '../common/pl_binary_download';
import { downloadBinaryNoExtract } from '../common/pl_binary_download';
import upath from 'upath';
import * as plpath from './pl_paths';
import { getDefaultPlVersion } from '../common/pl_version';

import net from 'node:net';
import type { PlConfig, PlLicenseMode, SshPlConfigGenerationResult } from '@milaboratories/pl-config';
import { getFreePort, generateSshPlConfigs } from '@milaboratories/pl-config';
import type { SupervisorStatus } from './supervisord';
import { supervisorStatus, supervisorStop as supervisorCtlShutdown, generateSupervisordConfigWithMinio, supervisorCtlStart, isSupervisordRunning, generateSupervisordConfig, isAllAlive } from './supervisord';
import type { ConnectionInfo, SshPlPorts } from './connection_info';
import { newConnectionInfo, parseConnectionInfo, stringifyConnectionInfo } from './connection_info';
import type { PlBinarySourceDownload } from '../common/pl_binary';

const minRequiredGlibcVersion = 2.28;

/** The class that downloads platforma, installs it on the server, generates configs and starts everything.
 * Old platformas use minio, new ones use local storage.
 * For daemonization of platforma we use supervisord.
 */
export class SshPl {
  /** Contains all info how the initialization process was done. */
  private initState: PlatformaInitState = { step: 'init' };
  constructor(
    public readonly logger: MiLogger,
    public readonly sshClient: SshClient,
    private readonly username: string,
  ) { }

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

  /** Returns debug info about the state of the class. */
  public info() {
    return {
      username: this.username,
      initState: this.initState,
    };
  }

  /** Provides an info if the platforma and minio are running along with the debug info. */
  public async isAlive(): Promise<SupervisorStatus> {
    const arch = await this.getArch();
    const remoteHome = await this.getUserHomeDirectory();
    return await supervisorStatus(this.logger, this.sshClient, remoteHome, arch.arch);
  }

  /** Starts all the services on the server.
    * Idempotent semantic: we could call it several times. */
  public async start(shouldUseMinio: boolean) {
    const arch = await this.getArch();
    const remoteHome = await this.getUserHomeDirectory();

    try {
      if (!isAllAlive(await this.isAlive(), shouldUseMinio)) {
        await supervisorCtlStart(this.sshClient, remoteHome, arch.arch);

        // We are waiting for Platforma to run to ensure that it has started.
        return await this.checkIsAliveWithInterval(shouldUseMinio);
      }
    } catch (e: unknown) {
      const msg = `SshPl.start: ${e}, ${await readPlStdout(this.sshClient, remoteHome)}`;
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
      const alive = await this.isAlive();
      if (isSupervisordRunning(alive)) {
        await supervisorCtlShutdown(this.sshClient, remoteHome, arch.arch);
        // Check if Minio is running by looking at the alive status
        const shouldUseMinio = alive.minio === true;
        return await this.checkIsAliveWithInterval(shouldUseMinio, 1000, 15, false);
      }
    } catch (e: unknown) {
      const msg = `PlSsh.stop: ${e}, ${await readPlStdout(this.sshClient, remoteHome)}`;
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
    // merge options with default ops.
    const ops: SshPlConfig = {
      ...defaultSshPlConfig,
      ...options,
    };

    const { onProgress } = ops;
    const state: PlatformaInitState = {
      localWorkdir: ops.localWorkdir,
      step: 'init',
      plBinaryOps: ops.plBinary,
    };

    try {
      await this.doStepDetectArch(state, onProgress);
      await this.doStepDetectHome(state, onProgress);
      await this.doStepCheckAlive(state, onProgress);
      await this.doStepReadExistedConfig(state, onProgress);
      await this.doStepCheckIfMinioIsUsed(state, onProgress);

      const needRestart = await this.doStepNeedRestart(state, ops, onProgress);
      if (!needRestart) {
        await onProgress?.('Platforma is already running. Skipping initialization.');
        return state.existedSettings!;
      }

      await this.doStepStopExistedPlatforma(state, onProgress);
      await this.doStepCheckGlibc(state, onProgress);
      await this.doStepDownloadBinaries(state, onProgress, ops);
      await this.doStepFetchPorts(state, onProgress);
      await this.doStepGenerateNewConfig(state, onProgress, ops);
      await this.doStepCreateFoldersAndSaveFiles(state, onProgress);
      await this.doStepConfigureSupervisord(state, onProgress);
      await this.doStepSaveNewConnectionInfo(state, onProgress, ops);
      await this.doStepStartPlatforma(state, onProgress);

      return state.connectionInfo!;
    } catch (e: unknown) {
      const msg = `SshPl.platformaInit: ${e}, state: ${JSON.stringify(this.removeSensitiveData(state))}`;
      this.logger.error(msg);

      throw new Error(msg);
    }
  }

  // Steps

  private async doStepDetectArch(state: PlatformaInitState, onProgress: OnProgressCallback) {
    state.step = 'detectArch';
    await onProgress?.('Detecting server architecture...');
    state.arch = await this.getArch();
  }

  private async doStepDetectHome(state: PlatformaInitState, onProgress: OnProgressCallback) {
    state.step = 'detectHome';
    await onProgress?.('Fetching user home directory...');
    state.remoteHome = await this.getUserHomeDirectory();
  }

  private async doStepCheckAlive(state: PlatformaInitState, onProgress: OnProgressCallback) {
    state.step = 'checkAlive';
    await onProgress?.('Checking platform status...');
    state.alive = await this.isAlive();
  }

  private async doStepReadExistedConfig(
    state: PlatformaInitState,
    onProgress: OnProgressCallback,
  ) {
    state.step = 'readExistedConfig';
    await onProgress?.('Reading existed config...');
    state.existedSettings = await readExistedConfig(this.sshClient, state.remoteHome!);
  }

  private async doStepCheckIfMinioIsUsed(state: PlatformaInitState, onProgress: OnProgressCallback) {
    state.step = 'checkIfMinioIsUsed';
    await onProgress?.('Checking if minio is used...');
    state.shouldUseMinio = state.existedSettings!.minioIsUsed ?? false;
    this.logger.info(`SshPl.platformaInit: should use minio? ${state.shouldUseMinio}`);
  }

  private async doStepNeedRestart(state: PlatformaInitState, ops: SshPlConfig, onProgress: OnProgressCallback): Promise<boolean> {
    state.step = 'needRestart';
    await onProgress?.('Checking if platform needs restart...');

    if (!state.alive?.platforma) {
      return true;
    }
    if (!state.existedSettings) {
      throw new Error(`SshPl.platformaInit: platforma is alive but existed settings are not found`);
    }

    const sameGA = state.existedSettings.useGlobalAccess == ops.useGlobalAccess;
    const samePlVersion = state.existedSettings.plVersion == ops.plBinary!.version;
    state.needRestart = !(sameGA && samePlVersion);
    this.logger.info(`SshPl.platformaInit: need restart? ${state.needRestart}`);

    return state.needRestart;
  }

  private async doStepStopExistedPlatforma(state: PlatformaInitState, onProgress: OnProgressCallback) {
    state.step = 'stopExistedPlatforma';
    if (!isAllAlive(state.alive!, state.shouldUseMinio!)) {
      return;
    }

    await onProgress?.('Stopping services...');
    await this.stop();
  }

  private async doStepCheckGlibc(state: PlatformaInitState, onProgress: OnProgressCallback) {
    state.step = 'checkGlibcVersion';
    await onProgress?.('Checking glibc version...');

    const glibcVersion = await getGlibcVersion(this.logger, this.sshClient);
    if (glibcVersion < minRequiredGlibcVersion)
      throw new Error(`glibc version ${glibcVersion} is too old. Version ${minRequiredGlibcVersion} or higher is required for Platforma.`);
  }

  private async doStepFetchPorts(state: PlatformaInitState, onProgress: OnProgressCallback) {
    state.step = 'fetchPorts';
    await onProgress?.('Fetching ports...');

    state.ports = await this.fetchPorts(state.remoteHome!, state.arch!);

    if (!state.ports.debug.remote
      || !state.ports.grpc.remote
      || !state.ports.minioPort.remote
      || !state.ports.minioConsolePort.remote
      || !state.ports.monitoring.remote
      || !state.ports.http?.remote) {
      throw new Error(`SshPl.platformaInit: remote ports are not defined`);
    }
  }

  private async doStepGenerateNewConfig(state: PlatformaInitState, onProgress: OnProgressCallback, ops: SshPlConfig) {
    state.step = 'generateNewConfig';
    await onProgress?.('Generating new config...');

    const config = await generateSshPlConfigs({
      logger: this.logger,
      workingDir: plpath.workDir(state.remoteHome!),
      portsMode: {
        type: 'customWithMinio',
        ports: {
          debug: state.ports!.debug.remote,
          grpc: state.ports!.grpc.remote,
          http: state.ports!.http!.remote,
          minio: state.ports!.minioPort.remote,
          minioConsole: state.ports!.minioConsolePort.remote,
          monitoring: state.ports!.monitoring.remote,

          httpLocal: state.ports!.http!.local,
          grpcLocal: state.ports!.grpc.local,
          minioLocal: state.ports!.minioPort.local,
        },
      },
      licenseMode: ops.license,
      useGlobalAccess: notEmpty(ops.useGlobalAccess),
      plConfigPostprocessing: ops.plConfigPostprocessing,
      useMinio: state.shouldUseMinio ?? false,
    });
    state.generatedConfig = { ...config };
  }

  private async doStepCreateFoldersAndSaveFiles(state: PlatformaInitState, onProgress: OnProgressCallback) {
    state.step = 'createFoldersAndSaveFiles';
    await onProgress?.('Generating folder structure...');

    const config = state.generatedConfig!;
    for (const [filePath, content] of Object.entries(config.filesToCreate)) {
      await this.sshClient.writeFileOnTheServer(filePath, content);
      this.logger.info(`Created file ${filePath}`);
    }

    for (const dir of config.dirsToCreate) {
      await this.sshClient.ensureRemoteDirCreated(dir);
      this.logger.info(`Created directory ${dir}`);
    }
  }

  private async doStepConfigureSupervisord(state: PlatformaInitState, onProgress: OnProgressCallback) {
    state.step = 'configureSupervisord';
    await onProgress?.('Writing supervisord configuration...');

    const config = state.generatedConfig!;

    let supervisorConfig: string;
    if (state.shouldUseMinio!) {
      supervisorConfig = generateSupervisordConfigWithMinio(
        config.minioConfig.storageDir,
        config.minioConfig.envs,
        await this.getFreePortForPlatformaOnServer(state.remoteHome!, state.arch!),
        config.workingDir,
        config.plConfig.configPath,
        state.binPaths!.minioRelPath!,
        state.binPaths!.downloadedPl,
      );
    } else {
      supervisorConfig = generateSupervisordConfig(
        await this.getFreePortForPlatformaOnServer(state.remoteHome!, state.arch!),
        config.workingDir,
        config.plConfig.configPath,
        state.binPaths!.downloadedPl,
      );
    }

    const writeResult = await this.sshClient.writeFileOnTheServer(plpath.supervisorConf(state.remoteHome!), supervisorConfig);
    if (!writeResult) {
      throw new Error(`Can not write supervisord config on the server ${plpath.workDir(state.remoteHome!)}`);
    }
  }

  private async doStepSaveNewConnectionInfo(state: PlatformaInitState, onProgress: OnProgressCallback, ops: SshPlConfig) {
    state.step = 'saveNewConnectionInfo';
    await onProgress?.('Saving connection information...');

    const config = state.generatedConfig!;
    state.connectionInfo = newConnectionInfo(
      config.plUser,
      config.plPassword,
      state.ports!,
      notEmpty(ops.useGlobalAccess),
      ops.plBinary!.version,
      state.shouldUseMinio!,
    );
    await this.sshClient.writeFileOnTheServer(
      plpath.connectionInfo(state.remoteHome!),
      stringifyConnectionInfo(state.connectionInfo),
    );
  }

  private async doStepStartPlatforma(state: PlatformaInitState, onProgress: OnProgressCallback) {
    state.step = 'startPlatforma';
    await onProgress?.('Starting Platforma on the server...');
    await this.start(state.shouldUseMinio!);
    state.started = true;
    this.initState = state;
    await onProgress?.('Platforma has been started successfully.');
  }

  private async doStepDownloadBinaries(state: PlatformaInitState, onProgress: OnProgressCallback, ops: SshPlConfig) {
    state.step = 'downloadBinaries';
    await onProgress?.('Downloading and uploading required binaries...');

    const downloadRes = await this.downloadBinariesAndUploadToTheServer(
      ops.localWorkdir, ops.plBinary!, state.remoteHome!, state.arch!, state.shouldUseMinio!,
    );

    state.binPaths = { ...downloadRes, history: undefined };
    state.downloadedBinaries = downloadRes.history;
  }

  public async downloadBinariesAndUploadToTheServer(
    localWorkdir: string,
    plBinary: PlBinarySourceDownload,
    remoteHome: string,
    arch: Arch,
    shouldUseMinio: boolean,
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
      if (shouldUseMinio) {
        const minio = await this.downloadAndUntar(
          localWorkdir, remoteHome, arch,
          'minio', plpath.minioDirName,
        );
        state.push(minio);
        await this.sshClient.chmod(minioPath, 0o750);
      }

      return {
        history: state,
        minioRelPath: shouldUseMinio ? minioPath : undefined,
        downloadedPl: plpath.platformaBin(remoteHome, arch.arch),
      };
    } catch (e: unknown) {
      const msg = `SshPl.downloadBinariesAndUploadToServer: ${e}, state: ${JSON.stringify(state)}`;
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

    try {
      await this.sshClient.exec('hash tar');
    } catch (_) {
      throw new Error(`tar is not installed on the server. Please install it before running Platforma.`);
    }

    // TODO: Create a proper archive to avoid xattr warnings
    const untarResult = await this.sshClient.exec(
      `tar --warning=no-all -xvf ${state.remoteArchivePath} --directory=${state.remoteDir}`,
    );

    if (untarResult.stderr)
      throw new Error(`downloadAndUntar: untar: stderr occurred: ${untarResult.stderr}, stdout: ${untarResult.stdout}`);

    state.untarDone = true;

    return state;
  }

  public async checkIsAliveWithInterval(shouldUseMinio: boolean, interval: number = 1000, count = 15, shouldStart = true): Promise<void> {
    const maxMs = count * interval;

    let total = 0;
    let alive = await this.isAlive();
    while (shouldStart ? !isAllAlive(alive, shouldUseMinio) : isAllAlive(alive, shouldUseMinio)) {
      await sleep(interval);
      total += interval;
      if (total > maxMs) {
        throw new Error(`isAliveWithInterval: The process did not ${shouldStart ? 'started' : 'stopped'} after ${maxMs} ms. Live status: ${JSON.stringify(alive)}`);
      }
      alive = await this.isAlive();
    }
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
      http: {
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

  private removeSensitiveData(state: PlatformaInitState): PlatformaInitState {
    const stateCopy = { ...state };
    stateCopy.generatedConfig = { ...stateCopy.generatedConfig, filesToCreate: { skipped: 'sanitized' } } as SshPlConfigGenerationResult;
    return stateCopy;
  }
}

type Arch = { platform: string; arch: string };

export type SshPlConfig = {
  localWorkdir: string;
  license: PlLicenseMode;
  useGlobalAccess?: boolean;
  plBinary?: PlBinarySourceDownload;

  onProgress: OnProgressCallback;
  plConfigPostprocessing?: (config: PlConfig) => PlConfig;
};

type OnProgressCallback = (...args: any) => Promise<any> | undefined;

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
  /** Could be anything, it's just an info for debug. */
  history?: DownloadAndUntarState[];
  minioRelPath?: string;
  downloadedPl: string;
};

/** Contains all info about downloading and extracting archive inside the remote server.
 * It's used for debug purposes only. */
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

type PlatformaInitStep =
  'init'
  | 'detectArch'
  | 'detectHome'
  | 'checkAlive'
  | 'readExistedConfig'
  | 'checkIfMinioIsUsed'
  | 'needRestart'
  | 'stopExistedPlatforma'
  | 'checkGlibcVersion'
  | 'downloadBinaries'
  | 'fetchPorts'
  | 'generateNewConfig'
  | 'createFoldersAndSaveFiles'
  | 'configureSupervisord'
  | 'saveNewConnectionInfo'
  | 'startPlatforma';

type PlatformaInitState = {
  step: PlatformaInitStep;
  localWorkdir?: string;
  plBinaryOps?: PlBinarySourceDownload;
  arch?: Arch;
  remoteHome?: string;
  alive?: SupervisorStatus;
  existedSettings?: ConnectionInfo;
  needRestart?: boolean;
  shouldUseMinio?: boolean;
  downloadedBinaries?: DownloadAndUntarState[];
  binPaths?: BinPaths;
  ports?: SshPlPorts;
  generatedConfig?: SshPlConfigGenerationResult;
  connectionInfo?: ConnectionInfo;
  started?: boolean;
};

/** Reads platforma cli logs from the remote server and returns a log string. */
async function readPlStdout(sshClient: SshClient, remoteHome: string) {
  let logs = '';
  try {
    logs = await sshClient.readFile(plpath.platformaCliLogs(remoteHome));
    return `platforma cli logs: ${logs}`;
  } catch (e: unknown) {
    return `can not read platforma cli logs: ${e}`;
  }
}

async function readExistedConfig(sshClient: SshClient, remoteHome: string): Promise<ConnectionInfo> {
  const connectionInfo = await sshClient.readFile(plpath.connectionInfo(remoteHome));
  return parseConnectionInfo(connectionInfo);
}

/**
 * Gets the glibc version on the remote system
 * @returns The glibc version as a number
 * @throws Error if version cannot be determined
 */
async function getGlibcVersion(logger: MiLogger, sshClient: SshClient): Promise<number> {
  try {
    const { stdout, stderr } = await sshClient.exec('ldd --version | head -n 1');
    if (stderr) {
      throw new Error(`Failed to check glibc version: ${stderr}`);
    }
    return parseGlibcVersion(stdout);
  } catch (e: unknown) {
    logger.error(`glibc version check failed: ${e}`);
    throw e;
  }
}

export function parseGlibcVersion(output: string): number {
  const versionMatch = output.match(/\d+\.\d+/);
  if (!versionMatch) {
    throw new Error(`Could not parse glibc version from: ${output}`);
  }

  return parseFloat(versionMatch[0]);
}
