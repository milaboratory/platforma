import type * as ssh from 'ssh2';
import { SshClient } from './ssh';
import type { MiLogger } from '@milaboratories/ts-helpers';
import { sleep, notEmpty } from '@milaboratories/ts-helpers';
import type { DownloadBinaryResult } from '../common/pl_binary_download';
import { downloadBinaryNoExtract } from '../common/pl_binary_download';
import upath from 'upath';
import * as plpath from './pl_paths';
import { getDefaultPlVersion } from '../common/pl_version';
import type { ProxySettings } from '@milaboratories/pl-http';
import { defaultHttpDispatcher } from '@milaboratories/pl-http';
import type { Dispatcher } from 'undici';

import net from 'node:net';
import type { PlConfig, PlLicenseMode, SshPlConfigGenerationResult } from '@milaboratories/pl-config';
import { getFreePort, generateSshPlConfigs } from '@milaboratories/pl-config';
import type { SupervisorStatus } from './supervisord';
import { supervisorStatus, supervisorStop as supervisorCtlShutdown, generateSupervisordConfigWithMinio, supervisorCtlStart, isSupervisordRunning, generateSupervisordConfig, isAllAlive } from './supervisord';
import type { ConnectionInfo, SshPlPorts } from './connection_info';
import { newConnectionInfo, parseConnectionInfo, stringifyConnectionInfo } from './connection_info';
import type { PlBinarySourceDownload } from '../common/pl_binary';

const minRequiredGlibcVersion = 2.28;

export class SshPl {
  private initState: PlatformaInitState = { step: 'init' };
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
      let msg = `SshPl.start: ${e}`;

      let logs = '';
      try {
        logs = await this.sshClient.readFile(plpath.platformaCliLogs(remoteHome));
        msg += `, platforma cli logs: ${logs}`;
      } catch (e: unknown) {
        msg += `, Can not read platforma cli logs: ${e}`;
      }

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
      const msg = `PlSsh.stop: ${e}`;
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
    const state: PlatformaInitState = { localWorkdir: options.localWorkdir, step: 'init' };

    const { onProgress } = options;

    // merge options with default ops.
    const ops: SshPlConfig = {
      ...defaultSshPlConfig,
      ...options,
    };
    state.plBinaryOps = ops.plBinary;

    try {
      await this.doStepDetectArch(state, onProgress);
      await this.doStepDetectHome(state, onProgress);

      const needRestartPlatforma = await this.doStepReadExistedConfig(state, ops, onProgress);
      if (!needRestartPlatforma) {
        await onProgress?.('Platforma is already running. Skipping initialization.');
        return state.existedSettings!;
      }
      await this.doStepStopExistedPlatforma(state, onProgress);
      await this.doStepCheckDbLock(state, onProgress);

      await onProgress?.('Installation platforma...');

      await this.doStepDownloadBinaries(state, onProgress, ops);
      await this.doStepFetchPorts(state);
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

  private async doStepStopExistedPlatforma(state: PlatformaInitState, onProgress: ((...args: any) => Promise<any>) | undefined) {
    state.step = 'stopExistedPlatforma';
    if (!isAllAlive(state.alive!, state.shouldUseMinio ?? false)) {
      return;
    }

    await onProgress?.('Stopping services...');
    await this.stop();
  }

  private removeSensitiveData(state: PlatformaInitState): PlatformaInitState {
    const stateCopy = { ...state };
    stateCopy.generatedConfig = { ...stateCopy.generatedConfig, filesToCreate: { skipped: 'sanitized' } } as SshPlConfigGenerationResult;
    return stateCopy;
  }

  private async doStepStartPlatforma(state: PlatformaInitState, onProgress: ((...args: any) => Promise<any>) | undefined) {
    state.step = 'startPlatforma';
    await onProgress?.('Starting Platforma on the server...');
    await this.start(state.shouldUseMinio ?? false);
    state.started = true;
    this.initState = state;

    await onProgress?.('Platforma has been started successfully.');
  }

  private async doStepSaveNewConnectionInfo(state: PlatformaInitState, onProgress: ((...args: any) => Promise<any>) | undefined, ops: SshPlConfig) {
    state.step = 'saveNewConnectionInfo';
    const config = state.generatedConfig!;
    await onProgress?.('Saving connection information...');
    state.connectionInfo = newConnectionInfo(
      config.plUser,
      config.plPassword,
      state.ports!,
      notEmpty(ops.useGlobalAccess),
      ops.plBinary!.version,
      state.shouldUseMinio ?? false,
    );
    await this.sshClient.writeFileOnTheServer(
      plpath.connectionInfo(state.remoteHome!),
      stringifyConnectionInfo(state.connectionInfo),
    );
    await onProgress?.('Connection information saved.');
  }

  private async doStepCheckDbLock(
    state: PlatformaInitState,
    onProgress?: (...args: any[]) => Promise<any>,
  ) {
    const removeLockFile = async (lockFilePath: string) => {
      try {
        await this.sshClient.exec(`rm -f ${lockFilePath}`);
        this.logger.info(`Removed stale lock file ${lockFilePath}`);
      } catch (e: unknown) {
        const msg = `Failed to remove stale lock file ${lockFilePath}: ${e}`;
        this.logger.error(msg);
        throw new Error(msg);
      }
    };

    state.step = 'checkDbLock';
    await onProgress?.('Checking for DB lock...');

    const lockFilePath = plpath.platformaDbLock(state.remoteHome!);
    const lockFileExists = await this.sshClient.checkFileExists(lockFilePath);

    if (!lockFileExists) {
      await onProgress?.('No DB lock found. Proceeding...');
      return;
    }

    this.logger.info(`DB lock file found at ${lockFilePath}. Checking which process holds it...`);
    const lockProcessInfo = await this.findLockHolder(lockFilePath);

    if (!lockProcessInfo) {
      this.logger.warn('Lock file exists but no process is holding it. Removing stale lock file...');
      await removeLockFile(lockFilePath);
      return;
    }

    this.logger.info(
      `Found process ${lockProcessInfo.pid} (user: ${lockProcessInfo.user}) holding DB lock`,
    );

    if (lockProcessInfo.user !== this.username) {
      const msg
        = `DB lock is held by process ${lockProcessInfo.pid} `
        + `owned by user '${lockProcessInfo.user}', but current user is '${this.username}'. `
        + 'Cannot kill process owned by different user.';
      this.logger.error(msg);
      throw new Error(msg);
    }

    this.logger.info(`Process ${lockProcessInfo.pid} belongs to current user ${this.username}. Killing it...`);
    await this.killRemoteProcess(lockProcessInfo.pid);
    this.logger.info('Process holding DB lock has been terminated.');

    // Verify lock file is gone or can be removed
    const lockStillExists = await this.sshClient.checkFileExists(lockFilePath);
    if (lockStillExists) {
      await removeLockFile(lockFilePath);
    }
  }

  private async doStepConfigureSupervisord(state: PlatformaInitState, onProgress: ((...args: any) => Promise<any>) | undefined) {
    await onProgress?.('Writing supervisord configuration...');
    state.step = 'configureSupervisord';

    const config = state.generatedConfig!;

    let supervisorConfig: string;
    if (state.shouldUseMinio) {
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
    await onProgress?.('Supervisord configuration written.');
  }

  private async doStepCreateFoldersAndSaveFiles(state: PlatformaInitState, onProgress: ((...args: any) => Promise<any>) | undefined) {
    state.step = 'createFoldersAndSaveFiles';
    const config = state.generatedConfig!;
    await onProgress?.('Generating folder structure...');
    for (const [filePath, content] of Object.entries(config.filesToCreate)) {
      await this.sshClient.writeFileOnTheServer(filePath, content);
      this.logger.info(`Created file ${filePath}`);
    }

    for (const dir of config.dirsToCreate) {
      await this.sshClient.ensureRemoteDirCreated(dir);
      this.logger.info(`Created directory ${dir}`);
    }
    await onProgress?.('Folder structure created.');
  }

  private async doStepGenerateNewConfig(state: PlatformaInitState, onProgress: ((...args: any) => Promise<any>) | undefined, ops: SshPlConfig) {
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
    await onProgress?.('New config generated');
  }

  private async doStepFetchPorts(state: PlatformaInitState) {
    state.step = 'fetchPorts';
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

  private async doStepDownloadBinaries(state: PlatformaInitState, onProgress: ((...args: any) => Promise<any>) | undefined, ops: SshPlConfig) {
    state.step = 'downloadBinaries';
    await onProgress?.('Downloading and uploading required binaries...');

    const glibcVersion = await getGlibcVersion(this.logger, this.sshClient);
    if (glibcVersion < minRequiredGlibcVersion)
      throw new Error(`glibc version ${glibcVersion} is too old. Version ${minRequiredGlibcVersion} or higher is required for Platforma.`);

    const downloadRes = await this.downloadBinariesAndUploadToTheServer(
      ops.localWorkdir, ops.plBinary!, state.remoteHome!, state.arch!, state.shouldUseMinio ?? false,
      ops.proxy,
    );
    await onProgress?.('All required binaries have been downloaded and uploaded.');

    state.binPaths = { ...downloadRes, history: undefined };
    state.downloadedBinaries = downloadRes.history;
  }

  private async doStepDetectArch(state: PlatformaInitState, onProgress: ((...args: any) => Promise<any>) | undefined) {
    state.step = 'detectArch';
    await onProgress?.('Detecting server architecture...');
    state.arch = await this.getArch();
    await onProgress?.('Server architecture detected.');
  }

  private async doStepDetectHome(state: PlatformaInitState, onProgress: ((...args: any) => Promise<any>) | undefined) {
    state.step = 'detectHome';
    await onProgress?.('Fetching user home directory...');
    state.remoteHome = await this.getUserHomeDirectory();
    await onProgress?.('User home directory retrieved.');
  }

  private async doStepReadExistedConfig(
    state: PlatformaInitState,
    ops: SshPlConfig,
    onProgress: ((...args: any) => Promise<any>) | undefined,
  ): Promise<boolean> {
    state.step = 'checkAlive';
    await onProgress?.('Checking platform status...');
    state.alive = await this.isAlive();

    if (!state.alive?.platforma) {
      return true;
    }

    await onProgress?.('All required services are running.');

    state.existedSettings = await this.readExistedConfig(state.remoteHome!);
    if (!state.existedSettings) {
      throw new Error(`SshPl.platformaInit: platforma is alive but existed settings are not found`);
    }

    const sameGA = state.existedSettings.useGlobalAccess == ops.useGlobalAccess;
    const samePlVersion = state.existedSettings.plVersion == ops.plBinary!.version;
    state.needRestart = !(sameGA && samePlVersion);
    this.logger.info(`SshPl.platformaInit: need restart? ${state.needRestart}`);

    state.shouldUseMinio = state.existedSettings.minioIsUsed;
    if (state.shouldUseMinio) {
      this.logger.info(`SshPl.platformaInit: minio is used`);
    } else {
      this.logger.info(`SshPl.platformaInit: minio is not used`);
    }

    if (!state.needRestart) {
      await onProgress?.('Server setup completed.');
      return false;
    }

    await onProgress?.('Stopping services...');
    await this.stop();

    return true;
  }

  public async downloadBinariesAndUploadToTheServer(
    localWorkdir: string,
    plBinary: PlBinarySourceDownload,
    remoteHome: string,
    arch: Arch,
    shouldUseMinio: boolean,
    proxy?: ProxySettings,
  ) {
    const state: DownloadAndUntarState[] = [];
    const dispatcher = defaultHttpDispatcher(proxy);
    try {
      const pl = await this.downloadAndUntar(
        localWorkdir, remoteHome, arch,
        'pl', `pl-${plBinary.version}`,
        dispatcher,
      );
      state.push(pl);

      const supervisor = await this.downloadAndUntar(
        localWorkdir, remoteHome, arch,
        'supervisord', plpath.supervisordDirName,
        dispatcher,
      );
      state.push(supervisor);

      const minioPath = plpath.minioBin(remoteHome, arch.arch);
      if (shouldUseMinio) {
        const minio = await this.downloadAndUntar(
          localWorkdir, remoteHome, arch,
          'minio', plpath.minioDirName,
          dispatcher,
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
    } finally {
      await dispatcher.close();
    }
  }

  private async findLockHolderWithLsof(lockFilePath: string): Promise<LockProcessInfo | null> {
    try {
      const { stdout } = await this.sshClient.exec(`lsof ${lockFilePath} 2>/dev/null || true`);
      const output = stdout.trim();
      if (!output) {
        return null;
      }

      // Example:
      // COMMAND     PID    USER   FD   TYPE DEVICE SIZE/OFF     NODE NAME
      // platforma 11628 rfiskov   10u   REG   1,16        0 66670038 ./LOCK
      const lines = output.split('\n');
      if (lines.length <= 1) {
        return null;
      }

      const parts = lines[1].trim().split(/\s+/);
      if (parts.length < 3) {
        return null;
      }

      const pid = Number.parseInt(parts[1], 10);
      const user = parts[2];

      return Number.isNaN(pid) || !user ? null : { pid, user };
    } catch (e: unknown) {
      this.logger.warn(`Failed to use lsof to check lock: ${e}`);
      return null;
    }
  }

  private async findLockHolderWithFuser(lockFilePath: string): Promise<LockProcessInfo | null> {
    try {
      const { stdout } = await this.sshClient.exec(`fuser ${lockFilePath} 2>/dev/null || true`);
      const output = stdout.trim();
      if (!output) {
        return null;
      }

      // Example: ./LOCK: 11628
      const match = output.match(/: (\d+)/);
      if (!match) {
        return null;
      }

      const pid = Number.parseInt(match[1], 10);
      if (Number.isNaN(pid)) {
        return null;
      }

      try {
        const psResult = await this.sshClient.exec(`ps -o user= -p ${pid} 2>/dev/null || true`);
        const user = psResult.stdout.trim();
        return user ? { pid, user } : null;
      } catch (e: unknown) {
        this.logger.warn(`Failed to get user for PID ${pid}: ${e}`);
        return null;
      }
    } catch (e: unknown) {
      this.logger.warn(`Failed to use fuser to check lock: ${e}`);
      return null;
    }
  }

  private async findLockHolder(lockFilePath: string): Promise<LockProcessInfo | null> {
    const viaLsof = await this.findLockHolderWithLsof(lockFilePath);
    if (viaLsof) {
      return viaLsof;
    }
    return this.findLockHolderWithFuser(lockFilePath);
  }

  private async killRemoteProcess(pid: number): Promise<void> {
    this.logger.info(`Killing process ${pid}...`);

    try {
      // Try graceful termination first
      await this.sshClient.exec(`kill ${pid} 2>/dev/null || true`);
      await sleep(1000);

      // Check if process still exists
      try {
        await this.sshClient.exec(`kill -0 ${pid} 2>/dev/null`);
        // Process still exists, force kill
        this.logger.warn(`Process ${pid} still alive after SIGTERM, forcing kill...`);
        await this.sshClient.exec(`kill -9 ${pid} 2>/dev/null || true`);
        await sleep(500);
      } catch {
        // Process is dead, nothing to do
      }
    } catch (e: unknown) {
      const msg = `Failed to kill process ${pid}: ${e}`;
      this.logger.error(msg);
      throw new Error(msg);
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
    dispatcher?: Dispatcher,
  ): Promise<DownloadAndUntarState> {
    const state: DownloadAndUntarState = {};
    state.binBasePath = plpath.binariesDir(remoteHome);
    await this.sshClient.ensureRemoteDirCreated(state.binBasePath);
    state.binBasePathCreated = true;

    let downloadBinaryResult: DownloadBinaryResult | null = null;
    const attempts = 5;
    for (let i = 1; i <= attempts; i++) {
      try {
        downloadBinaryResult = await downloadBinaryNoExtract({
          logger: this.logger,
          baseDir: localWorkdir,
          softwareName,
          tgzName,
          arch: arch.arch,
          platform: arch.platform,
          dispatcher,
        });
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

  public async readExistedConfig(remoteHome: string): Promise<ConnectionInfo> {
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
}

type Arch = { platform: string; arch: string };

export type SshPlConfig = {
  localWorkdir: string;
  license: PlLicenseMode;
  useGlobalAccess?: boolean;
  plBinary?: PlBinarySourceDownload;
  proxy?: ProxySettings;

  onProgress?: (...args: any) => Promise<any>;
  plConfigPostprocessing?: (config: PlConfig) => PlConfig;
};

export type LockProcessInfo = { pid: number; user: string };

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
  minioRelPath?: string;
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

type PlatformaInitStep =
  'init'
  | 'detectArch'
  | 'detectHome'
  | 'checkAlive'
  | 'stopExistedPlatforma'
  | 'checkDbLock'
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

/**
 * Gets the glibc version on the remote system
 * @returns The glibc version as a number
 * @throws Error if version cannot be determined
 */
async function getGlibcVersion(logger: MiLogger, sshClient: SshClient): Promise <number> {
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
