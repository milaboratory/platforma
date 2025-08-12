import type { ChildProcess, SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as pkg from './package';
import * as run from './run';
import * as composeCfg from './templates/compose';
import * as plCfg from './templates/pl-config';
import type * as types from './templates/types';
import * as platforma from './platforma';
import type { instanceInfo, instanceCommand } from './state';
import state from './state';
import * as util from './util';
import type winston from 'winston';

export default class Core {
  constructor(private readonly logger: winston.Logger) { }

  public startLast(): ChildProcess[] {
    const instance = state.currentInstance;
    if (!instance) {
      this.logger.error('failed to bring back Platforma Backend in the last started configuration: no last configuration found');
      throw new Error('no previous run info found');
    }

    return this.startInstance(instance);
  }

  public startInstance(instance: instanceInfo): ChildProcess[] {
    if (instance.runInfo) {
      const runInfo = this.renderRunInfo(instance.runInfo);
      this.logger.info(`Starting platforma backend instance '${instance.name}':\n${runInfo}`);
    }

    const result = run.runCommands(
      this.logger,
      instance.upCommands,
    );
    checkRunError(result.executed);

    if (result.spawned.length > 0 && instance.type === 'process') {
      instance.pid = result.spawned[result.spawned.length - 1].pid;
      state.setInstanceInfo(instance.name, instance);
      this.logger.info(`instance '${instance.name}' started`);
    }

    state.currentInstanceName = instance.name;

    return result.spawned;
  }

  public stopInstance(instance: instanceInfo) {
    this.logger.info(`stopping platforma backend instance '${instance.name}'...`);
    const result = run.runCommands(this.logger, instance.downCommands);
    checkRunError(result.executed);

    const iType = instance.type;
    switch (iType) {
      case 'docker': {
        return;
      }

      case 'process': {
        if (instance.pid && state.isInstanceActive(instance)) {
          process.kill(instance.pid);
        }

        return;
      }
      default:
        util.assertNever(iType);
    }
  }

  public switchInstance(instance: instanceInfo): ChildProcess[] {
    // Stop all other active instances before switching to new one;
    for (const iName of state.instanceList) {
      if (iName !== instance.name) {
        const iToStop = state.getInstanceInfo(iName);
        if (state.isInstanceActive(iToStop)) {
          this.stopInstance(iToStop);
        }
      }
    }

    return this.startInstance(instance);
  }

  public createLocal(instanceName: string, options?: createLocalOptions): instanceInfo {
    let plBinaryPath = platforma.binaryPath(options?.version, 'binaries', 'platforma');
    if (options?.sourcesPath) {
      plBinaryPath = path.join(os.tmpdir(), 'platforma-custom-build');
    }
    if (options?.binaryPath) {
      plBinaryPath = options.binaryPath;
    }

    let configPath = options?.configPath;
    const workdir: string = options?.workdir ?? (configPath ? process.cwd() : state.instanceDir(instanceName));

    if (options?.primaryURL) {
      options.configOptions = {
        ...options.configOptions,
        storages: {
          ...options.configOptions?.storages,
          primary: plCfg.storageSettingsFromURL(options.primaryURL, workdir, options.configOptions?.storages?.primary),
        },
      };
    }
    if (options?.libraryURL) {
      options.configOptions = {
        ...options.configOptions,
        storages: {
          ...options.configOptions?.storages,
          library: plCfg.storageSettingsFromURL(options.libraryURL, workdir, options.configOptions?.storages?.library),
        },
      };
    }

    const configOptions = plCfg.loadDefaults(this.getLastJwt(), options?.configOptions);

    this.logger.debug(`  checking license...`);
    this.checkLicense(options?.configOptions?.license?.value, options?.configOptions?.license?.file);

    const storageDirs: string[] = [
      `${configOptions.localRoot}/packages`,
      `${configOptions.localRoot}/packages-local`,
      `${configOptions.localRoot}/blocks-local`,
    ];
    if (configOptions.storages.primary.type === 'FS') {
      storageDirs.push(configOptions.storages.primary.rootPath);
    }
    if (configOptions.storages.library.type === 'FS') {
      storageDirs.push(configOptions.storages.library.rootPath);
      configOptions.hacks.libraryDownloadable = false;
    }
    if (configOptions.storages.work.type === 'FS') {
      storageDirs.push(configOptions.storages.work.rootPath);
    }

    this.logger.debug('  creating pl state directories...');
    for (const dir of storageDirs) {
      if (!fs.existsSync(dir)) {
        this.logger.debug(`    '${dir}'`);
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    for (const drv of configOptions.core.auth.drivers) {
      if (drv.driver === 'htpasswd') {
        if (!fs.existsSync(drv.path)) {
          this.logger.debug(`  installing default 'users.htpasswd' to ${drv.path}...`);
          fs.copyFileSync(pkg.assets('users.htpasswd'), drv.path);
        }
      }
    }

    if (!configPath) {
      configPath = path.join(configOptions.localRoot, 'config.yaml');
      this.logger.debug(`  rendering configuration '${configPath}'...`);
      fs.writeFileSync(configPath, plCfg.render(configOptions));
    }

    const upCommands: instanceCommand[] = [];
    if (options?.sourcesPath) {
      upCommands.push({
        cmd: 'go',
        args: ['build', '-o', plBinaryPath, '.'],
        workdir: path.resolve(options.sourcesPath, 'cmd', 'platforma'),
        runOpts: {
          stdio: 'inherit',
        },
      });
    }

    const runBinary: instanceCommand = {
      async: true,
      cmd: plBinaryPath,
      args: ['--quiet', '--config', configPath],
      workdir: workdir,
      runOpts: {
        stdio: 'inherit',
      },
    };

    if (options?.configOptions?.numCpu) {
      runBinary.runOpts.env = {
        GOMAXPROCS: String(options?.configOptions?.numCpu),
      };
    }

    // Process additional environment variables from CLI options
    if (options?.backendCommands) {
      if (!runBinary.runOpts.env) {
        runBinary.runOpts.env = {};
      }
      for (const cmd of options.backendCommands) {
        const equalIndex = cmd.indexOf('=');
        if (equalIndex > 0) {
          const key = cmd.substring(0, equalIndex);
          const value = cmd.substring(equalIndex + 1);
          runBinary.runOpts.env[key] = value;
        } else {
          this.logger.warn(`Invalid environment variable format: ${cmd}. Expected format: KEY=VALUE`);
        }
      }
    }

    // Process additional backend commands
    if (options?.backendCommands && options.backendCommands.length > 0) {
      this.logger.debug(`Adding backend commands: ${options.backendCommands.join(' ')}`);
      // Add commands as arguments to the binary
      runBinary.args = [...runBinary.args, ...options.backendCommands];
    }

    upCommands.push(runBinary);

    state.setInstanceInfo(instanceName, {
      type: 'process',
      upCommands: upCommands,
      downCommands: [],
      cleanupCommands: [],
      runInfo: {
        configPath,
        dbPath: configOptions.core.db.path,
        apiAddr: configOptions.grpc.listen,
        logPath: configOptions.log.path,
        primary: configOptions.storages.primary,
        work: configOptions.storages.work,
        library: configOptions.storages.library,
      },
    });

    return state.getInstanceInfo(instanceName);
  }

  public createLocalS3(instanceName: string, options?: createLocalS3Options): instanceInfo {
    this.logger.debug('creating platforma instance in \'local s3\' mode...');

    const minioPort = options?.minioPort ?? 9000;

    const instance = this.createLocal(instanceName, {
      ...options,
      primaryURL: options?.primaryURL ?? `s3e://testuser:testpassword@localhost:${minioPort}/platforma-primary-bucket/?region=no-region`,
      libraryURL: options?.libraryURL ?? `s3e://testuser:testpassword@localhost:${minioPort}/platforma-library-bucket/?region=no-region`,
    });

    const localRoot = options?.configOptions?.localRoot;
    const minioRunCmd = this.createMinio(instanceName, {
      minioPort: minioPort,
      minioConsolePort: options?.minioConsolePort,
      storage: localRoot ? path.join(localRoot, 'minio') : undefined,
    });

    instance.upCommands = [
      minioRunCmd.start,
      ...instance.upCommands,
    ];

    instance.downCommands = [
      minioRunCmd.stop,
      ...instance.downCommands,
    ];

    instance.cleanupCommands = [
      minioRunCmd.cleanup,
      ...instance.cleanupCommands,
    ];

    state.setInstanceInfo(instanceName, instance);
    return instance;
  }

  public createMinio(
    instanceName: string,
    options?: {
      image?: string;
      version?: string;
      minioPort?: number;
      minioConsolePort?: number;
      storage?: string;
    }): {
      start: instanceCommand;
      stop: instanceCommand;
      cleanup: instanceCommand;
    } {
    this.logger.debug('  creating docker compose for minio service...');
    const composeSrc = pkg.assets('compose-backend.yaml');
    const composeMinio = state.instanceDir(instanceName, 'compose-minio.yaml');

    composeCfg.render(composeSrc, composeMinio, `pl-${instanceName}-minio`,
      new Map([
        ['minio', {}],
      ]),
      { dropVolumes: true },
    );

    const version = options?.version ? `:${options.version}` : '';
    this.logger.debug(`    minio version: ${version}`);
    const image = options?.image ?? `quay.io/minio/minio${version}`;
    this.logger.debug(`    minio image: ${image}`);

    const storage = options?.storage ?? state.instanceDir(instanceName, 'minio');
    util.ensureDir(storage, { mode: '0775' });

    const minioPort = options?.minioPort ?? 9000;
    const minioConsolePort = options?.minioConsolePort ?? 9001;

    const envs = {
      MINIO_IMAGE: image,
      MINIO_STORAGE: path.resolve(storage),
      MINIO_PORT: minioPort.toString(),
      MINIO_CONSOLE_PORT: minioConsolePort.toString(),
    };

    return {
      start: {
        cmd: 'docker',
        args: ['compose', `--file=${composeMinio}`, 'up', '--detach', '--remove-orphans', '--pull=missing'],
        envs: envs,
        workdir: state.instanceDir(instanceName),
        runOpts: { stdio: 'inherit' },
      },
      stop: {
        cmd: 'docker',
        args: ['compose', `--file=${composeMinio}`, 'down'],
        envs: envs,
        workdir: state.instanceDir(instanceName),
        runOpts: { stdio: 'inherit' },
      },
      cleanup: {
        cmd: 'docker',
        args: ['compose', `--file=${composeMinio}`, 'down', '--volumes', '--remove-orphans'],
        envs: envs,
        workdir: state.instanceDir(instanceName),
        runOpts: { stdio: 'inherit' },
      },
    };
  }

  public createDockerS3(
    instanceName: string,
    localRoot: string,
    options?: {
      image?: string;
      version?: string;
      platformOverride?: string;

      logLevel?: string;
      auth?: types.authOptions;

      license?: string;
      licenseFile?: string;

      grpcPort?: number;
      grpcAddr?: string;

      presignHost?: string;

      monitoringPort?: number;
      monitoringAddr?: string;

      debugPort?: number;
      debugAddr?: string;

      s3Port?: number;
      s3ConsolePort?: number;

      customMounts?: { hostPath: string; containerPath?: string }[];

      backendCommands?: string[];
    },
  ): instanceInfo {
    this.logger.debug('creating platforma instance in \'docker s3\' mode...');

    const composeS3Path = pkg.assets('compose-backend.yaml');
    const image = options?.image ?? pkg.plImageTag(options?.version);

    this.checkLicense(options?.license, options?.licenseFile);

    const storagePath = (...s: string[]) => path.join(localRoot, ...s);
    const storageDir = (s: string) => {
      const p = storagePath(s);
      util.ensureDir(p, { mode: '0775' });
      return p;
    };

    const logFilePath = storagePath('logs', 'platforma.log');
    if (!fs.existsSync(logFilePath)) {
      fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
      fs.writeFileSync(logFilePath, '');
    }

    const presignHost = options?.presignHost ?? 'localhost';
    const presignPort = options?.s3Port ?? 9000;

    const primary = plCfg.storageSettingsFromURL(`s3e://testuser:testpassword@minio:${presignPort}/platforma-primary-bucket`);
    if (primary.type !== 'S3') {
      throw new Error('primary storage must have \'S3\' type in \'docker s3\' configuration');
    } else {
      primary.presignEndpoint = `http://${presignHost}:${presignPort}`;
    }

    const library = plCfg.storageSettingsFromURL(`s3e://testuser:testpassword@minio:${presignPort}/platforma-library-bucket`);
    if (library.type !== 'S3') {
      throw new Error(`${library.type} storage type is not supported for library storage`);
    } else {
      library.presignEndpoint = `http://${presignHost}:${presignPort}`;
    }

    const dbFSPath = storageDir('db');
    const workFSPath = storageDir('work');
    const usersFSPath = storagePath('users.htpasswd');
    if (!fs.existsSync(usersFSPath)) {
      fs.copyFileSync(pkg.assets('users.htpasswd'), usersFSPath);
    }

    const composeDstPath = storagePath('compose.yaml');
    if (fs.existsSync(composeDstPath)) {
      this.logger.info(`replacing docker compose file ${composeDstPath}`);
    }

    const backendMounts: composeCfg.VolumeMountOption[] = [];
    for (const mnt of options?.customMounts ?? []) {
      backendMounts.push({
        hostPath: mnt.hostPath,
        containerPath: mnt.containerPath ?? mnt.hostPath,
      });
    }
    composeCfg.render(composeS3Path, composeDstPath, `pl-${instanceName}`, new Map([
      ['minio', {}],
      ['backend', {
        platform: options?.platformOverride,
        mounts: backendMounts,
        commands: options?.backendCommands,
      }],
    ]));

    const envs: NodeJS.ProcessEnv = {
      MINIO_IMAGE: 'quay.io/minio/minio',
      MINIO_STORAGE: storageDir('minio'),

      PL_IMAGE: image,

      PL_AUTH_HTPASSWD: usersFSPath,
      PL_LICENSE: options?.license,
      PL_LICENSE_FILE: options?.licenseFile,

      PL_LOG_LEVEL: options?.logLevel ?? 'info',
      PL_LOG_DIR: path.dirname(logFilePath),
      PL_LOG_ROTATION_ENABLED: 'true',

      PL_RUNNER_WD_CACHE_ON_FAILURE: '1h',

      PL_DATA_DB_ROOT: dbFSPath,
      PL_DATA_PRIMARY_ROOT: storageDir('primary'),
      PL_DATA_LIBRARY_ROOT: storageDir('library'),
      PL_DATA_WORKDIR_ROOT: workFSPath,

      // Mount packages storage as volume, because APFS is case-insensitive on Mac OS X and this breaks some pl software installation.
      // PL_DATA_PACKAGE_ROOT: storageDir('packages'),

      ...this.configureDockerStorage('primary', primary),
      ...this.configureDockerStorage('library', library),
    };

    if (options?.grpcAddr) {
      const addrParts = options.grpcAddr.split(':');
      if (addrParts.length === 2) {
        envs.PL_LISTEN_ADDRESS = addrParts[0];
        envs.PL_LISTEN_PORT = addrParts[1];
      } else {
        envs.PL_LISTEN_ADDRESS = options.grpcAddr;
      }
    } else if (options?.grpcPort) {
      envs.PL_LISTEN_PORT = options.grpcPort.toString();
    }

    if (options?.monitoringAddr) {
      const addrParts = options.monitoringAddr.split(':');
      if (addrParts.length === 2) {
        envs.PL_MONITORING_IP = addrParts[0];
        envs.PL_MONITORING_PORT = addrParts[1];
      } else {
        envs.PL_MONITORING_IP = options.monitoringAddr;
      }
    } else if (options?.monitoringPort) {
      envs.PL_MONITORING_PORT = options.monitoringPort.toString();
    }

    if (options?.debugAddr) {
      const addrParts = options.debugAddr.split(':');
      if (addrParts.length === 2) {
        envs.PL_DEBUG_IP = addrParts[0];
        envs.PL_DEBUG_PORT = addrParts[1];
      } else {
        envs.PL_DEBUG_IP = options.debugAddr;
      }
    } else if (options?.debugPort) {
      envs.PL_DEBUG_PORT = options.debugPort.toString();
    }

    if (options?.s3Port) envs.MINIO_PORT = options.s3Port.toString();
    if (options?.s3ConsolePort) envs.MINIO_CONSOLE_PORT = options.s3ConsolePort.toString();

    if (options?.auth) {
      if (options.auth.enabled) {
        envs['PL_NO_AUTH'] = 'false';
      } else {
        envs['PL_NO_AUTH'] = 'true';
      }
      if (options.auth.drivers) {
        for (const drv of options.auth.drivers) {
          if (drv.driver === 'htpasswd') {
            envs['PL_AUTH_HTPASSWD'] = path.resolve(drv.path);
            drv.path = '/etc/platforma/users.htpasswd';
          }
        }
        envs['PL_AUTH_DRIVERS'] = JSON.stringify(options.auth.drivers);
      }
    }

    // Process additional backend commands
    if (options?.backendCommands && options.backendCommands.length > 0) {
      this.logger.debug(`Adding backend commands: ${options.backendCommands.join(' ')}`);
    }

    state.setInstanceInfo(instanceName, {
      type: 'docker',
      upCommands: [{
        cmd: 'docker',
        args: ['compose', `--file=${composeDstPath}`, 'up', '--detach', '--remove-orphans', '--pull=missing'],
        envs: envs,
        runOpts: { stdio: 'inherit' },
      }],
      downCommands: [{
        cmd: 'docker',
        args: ['compose', `--file=${composeDstPath}`, 'down'],
        envs: envs,
        runOpts: { stdio: 'inherit' },
      }],
      cleanupCommands: [{
        cmd: 'docker',
        args: ['compose', `--file=${composeDstPath}`, 'down', '--volumes', '--remove-orphans'],
        envs: envs,
        runOpts: { stdio: 'inherit' },
      }],
      runInfo: {
        apiPort: options?.grpcPort,
        apiAddr: options?.grpcAddr,
        logPath: logFilePath,
        primary: primary,
        work: { type: 'FS', rootPath: workFSPath },
        library: library,
        dbPath: dbFSPath,
      },
    });

    return state.getInstanceInfo(instanceName);
  }

  public createDocker(
    instanceName: string,
    localRoot: string,
    options?: {
      primaryStorageURL?: string;
      workStoragePath?: string;
      libraryStorageURL?: string;
      customMounts?: { hostPath: string; containerPath?: string }[];

      image?: string;
      version?: string;
      platformOverride?: string;

      logLevel?: string;

      auth?: types.authOptions;

      license?: string;
      licenseFile?: string;
      grpcPort?: number;
      grpcAddr?: string;

      monitoringPort?: number;
      monitoringAddr?: string;

      debugPort?: number;
      debugAddr?: string;

      backendCommands?: string[];
    },
  ): instanceInfo {
    this.logger.debug('creating platforma instance in \'docker\' mode...');

    const composeFSPath = pkg.assets('compose-backend.yaml');
    const image = options?.image ?? pkg.plImageTag(options?.version);

    this.checkLicense(options?.license, options?.licenseFile);

    const storagePath = (...s: string[]) => path.join(localRoot, ...s);
    const storageDir = (s: string) => {
      const p = storagePath(s);
      util.ensureDir(p, { mode: '0775' });
      return p;
    };

    const logFilePath = storagePath('logs', 'platforma.log');
    if (!fs.existsSync(logFilePath)) {
      fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
      fs.writeFileSync(logFilePath, '');
    }

    const dbFSPath = storageDir('db');
    const primaryFSPath = storageDir('primary');
    const libraryFSPath = storageDir('library');
    const workFSPath = storageDir('work');
    const usersFSPath = storagePath('users.htpasswd');
    if (!fs.existsSync(usersFSPath)) {
      fs.copyFileSync(pkg.assets('users.htpasswd'), usersFSPath);
    }

    const composeDstPath = storagePath('compose.yaml');
    if (fs.existsSync(composeDstPath)) {
      this.logger.info(`replacing docker compose file ${composeDstPath}`);
    }

    const backendMounts: composeCfg.VolumeMountOption[] = [];
    for (const mnt of options?.customMounts ?? []) {
      backendMounts.push({
        hostPath: mnt.hostPath,
        containerPath: mnt.containerPath ?? mnt.hostPath,
      });
    }
    this.logger.debug(`Rendering docker compose file '${composeDstPath}' using '${composeFSPath}' as base template`);
    composeCfg.render(composeFSPath, composeDstPath, `pl-${instanceName}`, new Map([
      ['backend', {
        platform: options?.platformOverride,
        mounts: backendMounts,
        commands: options?.backendCommands,
      }],
    ]));

    const primary = plCfg.storageSettingsFromURL(options?.primaryStorageURL ?? `file:${primaryFSPath}`, '.');
    const library = plCfg.storageSettingsFromURL(options?.libraryStorageURL ?? `file:${libraryFSPath}`, '.');

    const envs: NodeJS.ProcessEnv = {
      PL_IMAGE: image,
      PL_AUTH_HTPASSWD: usersFSPath,
      PL_LICENSE: options?.license,
      PL_LICENSE_FILE: options?.licenseFile,

      PL_LOG_LEVEL: options?.logLevel ?? 'info',
      PL_LOG_DIR: path.dirname(logFilePath),
      PL_LOG_ROTATION_ENABLED: 'true',

      PL_RUNNER_WD_CACHE_ON_FAILURE: '1h',

      PL_DATA_DB_ROOT: dbFSPath,
      PL_DATA_PRIMARY_ROOT: primaryFSPath,
      PL_DATA_LIBRARY_ROOT: libraryFSPath,
      PL_DATA_WORKDIR_ROOT: workFSPath,
      PL_DATA_PACKAGE_ROOT: storageDir('packages'),

      ...this.configureDockerStorage('primary', primary),
      ...this.configureDockerStorage('library', library),
    };

    if (options?.grpcAddr) {
      const addrParts = options.grpcAddr.split(':');
      if (addrParts.length === 2) {
        envs.PL_LISTEN_ADDRESS = addrParts[0];
        envs.PL_LISTEN_PORT = addrParts[1];
      } else {
        envs.PL_LISTEN_ADDRESS = options.grpcAddr;
      }
    } else if (options?.grpcPort) {
      envs.PL_LISTEN_PORT = options.grpcPort.toString();
    }

    if (options?.monitoringAddr) {
      const addrParts = options.monitoringAddr.split(':');
      if (addrParts.length === 2) {
        envs.PL_MONITORING_IP = addrParts[0];
        envs.PL_MONITORING_PORT = addrParts[1];
      } else {
        envs.PL_MONITORING_IP = options.monitoringAddr;
      }
    } else if (options?.monitoringPort) {
      envs.PL_MONITORING_PORT = options.monitoringPort.toString();
    }

    if (options?.debugAddr) {
      const addrParts = options.debugAddr.split(':');
      if (addrParts.length === 2) {
        envs.PL_DEBUG_IP = addrParts[0];
        envs.PL_DEBUG_PORT = addrParts[1];
      } else {
        envs.PL_DEBUG_IP = options.debugAddr;
      }
    } else if (options?.debugPort) {
      envs.PL_DEBUG_PORT = options.debugPort.toString();
    }

    if (options?.auth) {
      if (options.auth.enabled) {
        envs['PL_NO_AUTH'] = 'false';
      } else {
        envs['PL_NO_AUTH'] = 'true';
      }
      if (options.auth.drivers) {
        for (const drv of options.auth.drivers) {
          if (drv.driver === 'htpasswd') {
            envs['PL_AUTH_HTPASSWD'] = path.resolve(drv.path);
            drv.path = '/etc/platforma/users.htpasswd';
          }
        }
        envs['PL_AUTH_DRIVERS'] = JSON.stringify(options.auth.drivers);
      }
    }

    // Process additional backend commands
    if (options?.backendCommands && options.backendCommands.length > 0) {
      this.logger.debug(`Adding backend commands: ${options.backendCommands.join(' ')}`);
    }

    state.setInstanceInfo(instanceName, {
      type: 'docker',
      upCommands: [{
        cmd: 'docker',
        args: ['compose', `--file=${composeDstPath}`, 'up', '--detach', '--remove-orphans', '--pull=missing'],
        envs: envs,
        runOpts: { stdio: 'inherit' },
      }],
      downCommands: [{
        cmd: 'docker',
        args: ['compose', `--file=${composeDstPath}`, 'down'],
        envs: envs,
        runOpts: { stdio: 'inherit' },
      }],
      cleanupCommands: [{
        cmd: 'docker',
        args: ['compose', `--file=${composeDstPath}`, 'down', '--volumes', '--remove-orphans'],
        envs: envs,
        runOpts: { stdio: 'inherit' },
      }],
      runInfo: {
        apiPort: options?.grpcPort,
        apiAddr: options?.grpcAddr,
        logPath: logFilePath,
        primary: primary,
        work: { type: 'FS', rootPath: workFSPath },
        library: library,
        dbPath: dbFSPath,
      },
    });

    return state.getInstanceInfo(instanceName);
  }

  public cleanupInstance(instanceName?: string) {
    const removeWarns: string[] = [];
    const instancesToDrop = new Map<string, instanceInfo>();
    let warnMessage: string = '';

    if (instanceName) {
      const instance = state.getInstanceInfo(instanceName);
      instancesToDrop.set(instanceName, instance);
      const iType = instance.type;
      switch (iType) {
        case 'docker':{
          removeWarns.push(`docker service 'pl-${instanceName}', including all its volumes and data in '${state.instanceDir(instanceName)}' will be destroyed`);
          break;
        }
        case 'process':{
          removeWarns.push(`directory '${state.instanceDir(instanceName)}' would be deleted`);
          if (instance.downCommands) {
            removeWarns.push(`associated docker service, including all volumes and data will be destroyed`);
          }
          break;
        }
        default:
          util.assertNever(iType);
      }

      if (instanceName === state.currentInstanceName) {
        removeWarns.push(
          'last command run cache (\'pl-dev start\' shorthand will stop working until next full start command call)',
        );
      }

      warnMessage = `
You are going to reset the state of platforma service '${instanceName}':
  - ${removeWarns.join('\n  - ')}
`;
    } else {
      for (const iName of state.instanceList) {
        instancesToDrop.set(iName, state.getInstanceInfo(iName));
      }

      removeWarns.push(
        'last command run cache (\'pl-dev start\' shorthand will stop working until next full start command call)',
        `all service configurations stored in: ${state.instanceDir()} (including all associated docker containers and volumes)`,
      );

      warnMessage = `
You are going to reset the state of all platforma services configured with pl-bootstrap package.
  - ${removeWarns.join('\n  - ')}
`;
    }

    this.logger.warn(warnMessage);
    if (!util.askYN('Are you sure?')) {
      this.logger.info('Reset action was canceled');
      return;
    }

    for (const [name, instance] of instancesToDrop.entries()) {
      if (instance.cleanupCommands.length) {
        this.logger.info(`Wiping instance ${name} services`);
        const result = run.runCommands(this.logger, instance.cleanupCommands);
        checkRunError(result.executed, `failed to wipe instance ${name} services`);
      }

      this.logger.info(`Destroying instance '${name}' data directory`);
      fs.rmSync(state.instanceDir(name), { recursive: true, force: true });
    }

    if (!instanceName) {
      this.logger.info(`Destroying state dir '${state.path()}'`);
      fs.rmSync(state.path(), { recursive: true, force: true });
    }

    this.logger.info(
      `\nIf you want to remove all downloaded platforma binaries, delete '${state.binaries()}' dir manually\n`,
    );
  }

  public mergeLicenseEnvs(flags: { 'license'?: string; 'license-file'?: string }) {
    if (flags.license === undefined) {
      if ((process.env.MI_LICENSE ?? '') != '') flags.license = process.env.MI_LICENSE;
      else if ((process.env.PL_LICENSE ?? '') != '') flags.license = process.env.PL_LICENSE;
    }

    // set 'license-file' only if license is still undefined
    if (flags['license-file'] === undefined && flags.license === undefined) {
      if ((process.env.MI_LICENSE_FILE ?? '') != '') flags['license-file'] = process.env.MI_LICENSE_FILE;
      else if ((process.env.PL_LICENSE_FILE ?? '') != '') flags['license-file'] = process.env.PL_LICENSE_FILE;
      else if (fs.existsSync(path.resolve(os.homedir(), '.pl.license')))
        flags['license-file'] = path.resolve(os.homedir(), '.pl.license');
    }
  }

  public initAuthDriversList(
    flags: {
      'auth-htpasswd-file'?: string;

      'auth-ldap-server'?: string;
      'auth-ldap-default-dn'?: string;
    },
    workdir: string,
  ): types.authDriver[] | undefined {
    const authDrivers: types.authDriver[] = [];
    if (flags['auth-htpasswd-file']) {
      authDrivers.push({
        driver: 'htpasswd',
        path: path.resolve(workdir, flags['auth-htpasswd-file']),
      });
    }

    if (Boolean(flags['auth-ldap-server']) !== Boolean(flags['auth-ldap-default-dn'])) {
      throw new Error('LDAP auth settings require both \'server\' and \'default DN\' options to be set');
    }

    if (flags['auth-ldap-server']) {
      authDrivers.push({
        driver: 'ldap',
        serverUrl: flags['auth-ldap-server'],
        defaultDN: flags['auth-ldap-default-dn']!,
      });
    }

    if (authDrivers.length === 0) {
      return undefined;
    }

    return [{ driver: 'jwt', key: this.getLastJwt() }, ...authDrivers] as types.authDriver[];
  }

  /** Gets the last stored JWT secret key or generates it and stores in a file. */
  public getLastJwt() {
    const jwtFile = state.path('auth.jwt');
    const encoding = 'utf-8';

    let lastJwt = '';
    if (fs.existsSync(jwtFile)) {
      lastJwt = fs.readFileSync(jwtFile, { encoding });
    }

    if (lastJwt == '') {
      lastJwt = util.randomStr(64);
      fs.writeFileSync(jwtFile, lastJwt, { encoding });
    }

    return lastJwt;
  }

  private checkLicense(value?: string, file?: string) {
    if (value !== undefined && value != '') return;

    if (file !== undefined && file != '') return;

    this.logger.error(`A license for Platforma Backend must be set.

You can provide the license directly using the '--license' flag
or use the '--license-file' flag if the license is stored in a file.

Alternatively, you can set it via the environment variables 'MI_LICENSE' or 'PL_LICENSE'.

The license file can also be set with the variables 'MI_LICENSE_FILE' or 'PL_LICENSE_FILE',
or stored in '$HOME/.pl.license'.

You can obtain the license from "https://licensing.milaboratories.com".`);

    throw new Error(`The license was not provided.`);
  }

  private configureDockerStorage(storageID: string, storage: types.storageOptions): NodeJS.ProcessEnv {
    const envs: NodeJS.ProcessEnv = {};
    const sType = storage.type;
    storageID = storageID.toUpperCase();

    switch (sType) {
      case 'S3':
        switch (storageID) {
          case 'PRIMARY': {
            // Construct the S3 URL for primary storage
            if (storage.endpoint && storage.bucketName) {
              envs['PL_DATA_LIBRARY_S3_URL'] = `${storage.endpoint}${storage.bucketName}`;
            }
            if (storage.endpoint) envs['PL_PRIMARY_STORAGE_S3_ENDPOINT'] = storage.endpoint;
            if (storage.presignEndpoint) envs['PL_PRIMARY_STORAGE_S3_EXTERNAL_ENDPOINT'] = storage.presignEndpoint;
            if (storage.region) envs['PL_PRIMARY_STORAGE_S3_REGION'] = storage.region;
            if (storage.key) envs['PL_PRIMARY_STORAGE_S3_KEY'] = storage.key;
            if (storage.secret) envs['PL_PRIMARY_STORAGE_S3_SECRET'] = storage.secret;
            break;
          }
          case 'LIBRARY': {
            // Construct the S3 URL for library storage
            if (storage.endpoint && storage.bucketName) {
              envs['PL_DATA_LIBRARY_S3_URL'] = `library=${storage.endpoint}${storage.bucketName}`;
            }
            if (storage.endpoint) envs['PL_DATA_LIBRARY_S3_ENDPOINT'] = `library=${storage.endpoint}`;
            if (storage.presignEndpoint) envs['PL_DATA_LIBRARY_S3_EXTERNAL_ENDPOINT'] = `library=${storage.presignEndpoint}`;
            if (storage.region) envs['PL_DATA_LIBRARY_S3_REGION'] = `library=${storage.region}`;
            if (storage.key) envs['PL_DATA_LIBRARY_S3_KEY'] = `library=${storage.key}`;
            if (storage.secret) envs['PL_DATA_LIBRARY_S3_SECRET'] = `library=${storage.secret}`;
            break;
          }
          default:
            throw new Error(`Unknown storage ID: ${storageID}`);
        }
        return envs;
      case 'FS':
        switch (storageID) {
          case 'PRIMARY':
            if (storage.rootPath) envs['PL_PRIMARY_STORAGE_FS'] = storage.rootPath;
            break;
          case 'LIBRARY':
            if (storage.rootPath) envs['PL_DATA_LIBRARY_FS_PATH'] = storage.rootPath;
            break;
          default:
            throw new Error(`Unknown storage ID: ${storageID}`);
        }
        return envs;

      default:
        util.assertNever(sType);
    }

    return {};
  }

  private renderRunInfo(
    runInfo: {
      configPath?: string;
      apiPort?: number;
      apiAddr?: string;
      logPath?: string;
      dbPath?: string;
      primary?: types.storageOptions;
      work?: types.fsStorageOptions;
      library?: types.storageOptions;
    },
    indent: number = 10,
  ) {
    const report: string[] = [];

    const column = (t: string) => t.padStart(indent, ' ');
    if (runInfo.configPath) {
      report.push(`${column('config')}: ${runInfo.configPath}`);
    }

    if (runInfo.apiAddr) {
      report.push(`${column('API')}: ${runInfo.apiAddr}`);
    } else if (runInfo.apiPort) {
      report.push(`${column('API')}: 127.0.0.1:${runInfo.apiPort.toString()}`);
    } else {
      report.push(`${column('API')}: 127.0.0.1:6345`);
    }

    if (runInfo.logPath) {
      report.push(`${column('log')}: ${runInfo.logPath}`);
    }

    const primaryType = runInfo.primary?.type;
    switch (primaryType) {
      case undefined:
        break;

      case 'FS':
        report.push(`${column('primary')}: ${runInfo.primary!.rootPath!}`);
        break;

      case 'S3':
        report.push(
          `${column('primary')}: S3 at '${runInfo.primary!.endpoint ?? 'AWS'}', bucket '${runInfo.primary!.bucketName!}', prefix: '${runInfo.primary!.keyPrefix ?? ''}'`,
        );
        break;

      default:
        util.assertNever(primaryType);
    }

    const libraryType = runInfo.library?.type;
    switch (libraryType) {
      case undefined:
        break;

      case 'FS':
        report.push(`${column('library')}: ${runInfo.library!.rootPath!}`);
        break;

      case 'S3':
        report.push(
          `${column('library')}: S3 at '${runInfo.library!.endpoint ?? 'AWS'}', bucket '${runInfo.library!.bucketName!}', prefix: '${runInfo.library!.keyPrefix ?? ''}'`,
        );
        break;

      default:
        util.assertNever(libraryType);
    }

    if (runInfo.work) {
      report.push(`${column('workdirs')}: ${runInfo.work.rootPath}`);
    }

    if (runInfo.dbPath) {
      report.push(`${column('db')}: ${runInfo.dbPath}`);
    }

    return report.join('\n');
  }
}

export function checkRunError(result: SpawnSyncReturns<Buffer>[], message?: string) {
  for (const buffer of result) {
    if (buffer.error) {
      throw buffer.error;
    }

    const msg = message ?? 'failed to run command';

    if (buffer.status !== 0) {
      throw new Error(`${msg}, process exited with code '${buffer.status}'`);
    }
  }
}

export type createLocalOptions = {
  version?: string;
  sourcesPath?: string;
  binaryPath?: string;
  configPath?: string;
  configOptions?: plCfg.plOptions;
  workdir?: string;

  primaryURL?: string;
  libraryURL?: string;

  backendCommands?: string[];
};

export type createLocalFSOptions = createLocalOptions;

export type createLocalS3Options = createLocalOptions & {
  minioPort?: number;
  minioConsolePort?: number;
};
