import { ChildProcess, SpawnSyncReturns, spawn, spawnSync } from 'child_process';
import yaml from 'yaml';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as pkg from './package';
import * as run from './run';
import * as plCfg from './templates/pl-config';
import * as types from './templates/types';
import * as platforma from './platforma';
import state from './state';
import * as util from './util';
import winston from 'winston';

export default class Core {
  constructor(private readonly logger: winston.Logger) {}

  public startLast() {
    const result = run.rerunLast(this.logger, { stdio: 'inherit' });
    checkRunError(result, 'failed to bring back Platforma Backend in the last started configuration');
  }

  public startLocal(options?: startLocalOptions): ChildProcess {
    const cmd = options?.binaryPath ?? platforma.binaryPath(options?.version, 'binaries', 'platforma');
    var configPath = options?.configPath;
    const workdir: string = options?.workdir ?? (configPath ? process.cwd() : state.path());

    if (options?.primaryURL) {
      options.configOptions = {
        ...options.configOptions,
        storages: {
          ...options.configOptions?.storages,
          primary: plCfg.storageSettingsFromURL(options.primaryURL, workdir, options.configOptions?.storages?.primary)
        }
      };
    }
    if (options?.libraryURL) {
      options.configOptions = {
        ...options.configOptions,
        storages: {
          ...options.configOptions?.storages,
          library: plCfg.storageSettingsFromURL(options.libraryURL, workdir, options.configOptions?.storages?.library)
        }
      };
    }

    const configOptions = plCfg.loadDefaults(this.getLastJwt(), options?.configOptions);

    this.logger.debug(`  checking license...`);
    this.checkLicense(options?.configOptions?.license?.value, options?.configOptions?.license?.file);

    const storageDirs: string[] = [
      `${configOptions.localRoot}/packages`,
      `${configOptions.localRoot}/packages-local`,
      `${configOptions.localRoot}/blocks-local`
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
      configPath = state.path('config-local.yaml');
      this.logger.debug(`  rendering configuration '${configPath}'...`);
      fs.writeFileSync(configPath, plCfg.render(configOptions));
    }

    var configReport: string[] = [];
    const column = (t: string) => t.padStart(10, ' ');
    configReport.push(`${column('config')}: ${configPath}`);
    configReport.push(`${column('API')}: ${configOptions.grpc.listen}`);
    configReport.push(`${column('log')}: ${configOptions.log.path}`);

    const primaryType = configOptions.storages.primary.type;
    switch (primaryType) {
      case 'FS':
        configReport.push(`${column('primary')}: ${configOptions.storages.primary.rootPath}`);
        break;

      case 'S3':
        configReport.push(
          `${column('primary')}: S3 at '${configOptions.storages.primary.endpoint ?? 'AWS'}', bucket '${configOptions.storages.primary.bucketName}', prefix: '${configOptions.storages.primary.keyPrefix}'`
        );
        break;

      default:
        util.assertNever(primaryType);
    }

    const libraryType = configOptions.storages.library.type;
    switch (libraryType) {
      case 'FS':
        configReport.push(`${column('library')}: ${configOptions.storages.library.rootPath}`);
        break;

      case 'S3':
        configReport.push(
          `${column('library')}: S3 at '${configOptions.storages.library.endpoint ?? 'AWS'}', bucket '${configOptions.storages.library.bucketName}', prefix: '${configOptions.storages.library.keyPrefix}'`
        );
        break;

      default:
        util.assertNever(libraryType);
    }

    configReport.push(`${column('workdirs')}: ${configOptions.storages.work.rootPath}`);

    this.logger.info(`Starting platforma:\n${configReport.join('\n')}`);

    return run.runProcess(
      this.logger,
      cmd,
      ['-config', configPath],
      {
        cwd: workdir,
        stdio: 'inherit'
      },
      {
        storagePath: configOptions.localRoot
      }
    );
  }

  public startLocalS3(options?: startLocalS3Options): ChildProcess {
    this.logger.debug("starting platforma in 'local s3' mode...");

    const minioPort = options?.minioPort ?? 9000;
    const localRoot = options?.configOptions?.localRoot;
    this.startMinio({
      minioPort: minioPort,
      minioConsolePort: options?.minioConsolePort,
      storage: localRoot ? path.join(localRoot, 'minio') : undefined
    });

    return this.startLocal({
      ...options,
      primaryURL: `s3e://testuser:testpassword@localhost:${minioPort}/main-bucket/?region=no-region`,
      libraryURL: `s3e://testuser:testpassword@localhost:${minioPort}/library-bucket/?region=no-region`
    });
  }

  public startMinio(options?: {
    image?: string;
    version?: string;
    minioPort?: number;
    minioConsolePort?: number;
    storage?: string;
  }) {
    this.logger.debug('  starting minio...');
    var composeMinio = pkg.assets('compose-backend.yaml');

    const version = options?.version ? `:${options.version!}` : '';
    this.logger.debug(`    minio version: ${version}`);
    const image = options?.image ?? `quay.io/minio/minio${version}`;
    this.logger.debug(`    minio image: ${image}`);

    const storage = options?.storage ?? state.path('data', 'minio');

    const minioPort = options?.minioPort ?? 9000;
    const minioConsolePort = options?.minioConsolePort ?? 9001;

    const envs = {
      MINIO_IMAGE: image,
      MINIO_STORAGE: path.resolve(storage),
      MINIO_PORT: minioPort.toString(),
      MINIO_CONSOLE_PORT: minioConsolePort.toString()
    };
    const compose = this.readComposeFile(composeMinio);

    this.logger.debug(`    spawning child 'docker' process...`);
    const result = spawnSync(
      'docker',
      ['compose', `--file=${composeMinio}`, 'up', '--detach', '--remove-orphans', '--pull=missing', 'minio'],
      {
        env: {
          ...process.env,
          ...envs
        },
        stdio: 'inherit'
      }
    );

    checkRunError(result, 'failed to start MinIO service in docker');
  }

  public buildPlatforma(options: { repoRoot: string; binPath?: string }): string {
    const cmdPath: string = path.resolve(options.repoRoot, 'cmd', 'platforma');
    const binPath: string = options.binPath ?? path.join(os.tmpdir(), 'platforma-local-build');

    this.logger.info('Building Platforma Backend binary from sources');
    this.logger.info(`  sources path: ${options.repoRoot}`);
    this.logger.info(`  binary path: ${binPath}`);

    const result = spawnSync('go', ['build', '-o', binPath, '.'], {
      cwd: cmdPath,
      stdio: 'inherit'
    });

    checkRunError(result, "failed to build platforma binary from sources using 'go build' command");
    return binPath;
  }

  public startDockerS3(
    localRoot: string,
    options?: {
      image?: string;
      version?: string;
      auth?: types.authOptions;
      license?: string;
      licenseFile?: string;
      'grpc-port'?: number;
      'monitoring-port'?: number;
      'debug-port'?: number;
    }
  ) {
    const composeS3Path = pkg.assets('compose-backend.yaml');
    const image = options?.image ?? pkg.plImageTag(options?.version);

    this.checkLicense(options?.license, options?.licenseFile);

    const storagePath = (s: string) => path.join(localRoot, s);
    const logFilePath = storagePath('platforma.log');
    if (!fs.existsSync(logFilePath)) {
      fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
      fs.writeFileSync(logFilePath, '');
    }

    const primary = plCfg.storageSettingsFromURL('s3e://testuser:testpassword@minio:9000/main-bucket');
    if (primary.type !== 'S3') {
      throw new Error("primary storage must have 'S3' type in 'docker s3' configuration");
    } else {
      primary.presignEndpoint = 'http://localhost:9000';
    }

    const library = plCfg.storageSettingsFromURL('s3e://testuser:testpassword@minio:9000/library-bucket');
    if (library.type !== 'S3') {
      throw new Error(`${library.type} storage type is not supported for library storage`);
    } else {
      library.presignEndpoint = 'http://localhost:9000';
    }

    const envs: NodeJS.ProcessEnv = {
      MINIO_IMAGE: 'quay.io/minio/minio',
      MINIO_STORAGE: storagePath('minio'),

      PL_IMAGE: image,

      PL_AUTH_HTPASSWD_PATH: pkg.assets('users.htpasswd'),
      PL_LICENSE: options?.license,
      PL_LICENSE_FILE: options?.licenseFile,

      PL_LOG_LEVEL: 'info',
      PL_LOG_FILE: logFilePath,

      PL_DATA_DB_ROOT: storagePath('db'),
      PL_DATA_PRIMARY_ROOT: storagePath('primary'),
      PL_DATA_LIBRARY_ROOT: storagePath('library'),
      PL_DATA_WORKDIR_ROOT: storagePath('work'),
      PL_DATA_PACKAGE_ROOT: storagePath('packages'),

      ...this.configureDockerStorage('primary', primary),
      ...this.configureDockerStorage('library', library)
    };

    if (options?.['grpc-port'] != undefined) envs.PL_GRPC_PORT = options['grpc-port'].toString();
    if (options?.['monitoring-port'] != undefined) envs.PL_MONITORING_PORT = options['monitoring-port'].toString();
    if (options?.['debug-port'] != undefined) envs.PL_DEBUG_PORT = options['debug-port'].toString();

    if (options?.auth) {
      if (options.auth.enabled) {
        envs['PL_AUTH_ENABLED'] = 'true';
      }
      if (options.auth.drivers) {
        for (const drv of options.auth.drivers) {
          if (drv.driver === 'htpasswd') {
            envs['PL_AUTH_HTPASSWD_PATH'] = path.resolve(drv.path);
            drv.path = '/etc/platforma/users.htpasswd';
          }
        }
        envs['PL_AUTH_DRIVERS'] = JSON.stringify(options.auth.drivers);
      }
    }

    const result = run.runDocker(
      this.logger,
      [
        'compose',
        `--file=${composeS3Path}`,
        'up',
        '--detach',
        '--remove-orphans',
        '--pull=missing',
        'minio',
        'backend'
      ],
      {
        env: envs,
        stdio: 'inherit'
      },
      {
        plImage: image,
        composePath: composeS3Path
      }
    );

    checkRunError(result, 'failed to start Platforma Backend in Docker');
    state.isActive = true;
  }

  public startDocker(
    localRoot: string,
    options?: {
      primaryStorageURL?: string;
      workStoragePath?: string;
      libraryStorageURL?: string;

      image?: string;
      version?: string;
      auth?: types.authOptions;

      license?: string;
      licenseFile?: string;
      'grpc-port'?: number;
      'monitoring-port'?: number;
      'debug-port'?: number;
    }
  ) {
    var composeFSPath = pkg.assets('compose-backend.yaml');
    const image = options?.image ?? pkg.plImageTag(options?.version);

    this.checkLicense(options?.license, options?.licenseFile);

    const storagePath = (s: string) => path.join(localRoot, s);

    const primaryFSPath = storagePath('primary');
    const workFSPath = storagePath('work');
    const libraryFSPath = storagePath('library');

    const primary = plCfg.storageSettingsFromURL(options?.primaryStorageURL ?? `file:.`, '.');
    const library = plCfg.storageSettingsFromURL(options?.libraryStorageURL ?? `file:.`, '.');

    const envs: NodeJS.ProcessEnv = {
      MINIO_IMAGE: 'quay.io/minio/minio',
      MINIO_STORAGE: storagePath('minio'),

      PL_IMAGE: image,
      PL_AUTH_HTPASSWD_PATH: pkg.assets('users.htpasswd'),
      PL_LICENSE: options?.license,
      PL_LICENSE_FILE: options?.licenseFile,

      PL_DATA_DB_ROOT: storagePath('db'),
      PL_DATA_PRIMARY_ROOT: primaryFSPath,
      PL_DATA_LIBRARY_ROOT: libraryFSPath,
      PL_DATA_WORKDIR_ROOT: storagePath('work'),
      PL_DATA_PACKAGE_ROOT: storagePath('packages'),

      ...this.configureDockerStorage('primary', primary),
      ...this.configureDockerStorage('library', library)
    };

    if (options?.['grpc-port'] != undefined) envs.PL_GRPC_PORT = options['grpc-port'].toString();
    if (options?.['monitoring-port'] != undefined) envs.PL_MONITORING_PORT = options['monitoring-port'].toString();
    if (options?.['debug-port'] != undefined) envs.PL_DEBUG_PORT = options['debug-port'].toString();

    const compose = this.readComposeFile(composeFSPath);

    if (options?.auth) {
      if (options.auth.enabled) {
        envs['PL_AUTH_ENABLED'] = 'true';
      }
      if (options.auth.drivers) {
        for (const drv of options.auth.drivers) {
          if (drv.driver === 'htpasswd') {
            envs['PL_AUTH_HTPASSWD_PATH'] = path.resolve(drv.path);
            drv.path = '/etc/platforma/users.htpasswd';
          }
        }
        envs['PL_AUTH_DRIVERS'] = JSON.stringify(options.auth.drivers);
      }
    }

    const result = run.runDocker(
      this.logger,
      ['compose', `--file=${composeFSPath}`, 'up', '--detach', '--remove-orphans', '--pull=missing', 'backend'],
      {
        env: envs,
        stdio: 'inherit'
      },
      {
        plImage: image,
        composePath: composeFSPath,
        primaryPath: primaryFSPath,
        workPath: workFSPath,
        libraryPath: libraryFSPath
      }
    );

    checkRunError(result, 'failed to start Platforma Backend in Docker');
    state.isActive = true;
  }

  public stop() {
    if (!state.isActive) {
      console.log('no running service detected');
      return;
    }

    const lastRun = state.lastRun!;

    switch (lastRun.mode) {
      case 'docker':
        const result = spawnSync('docker', ['compose', '--file', lastRun.docker!.composePath!, 'down'], {
          env: {
            ...process.env,
            ...lastRun.envs
          },
          stdio: 'inherit'
        });
        state.isActive = false;
        if (result.status !== 0) process.exit(result.status);
        return;

      case 'process':
        state.isActive = false;
        process.kill(lastRun.process!.pid!);
        return;

      default:
        util.assertNever(lastRun.mode);
    }
  }

  public cleanup() {
    const removeWarns = [
      "last command run cache ('pl-service start' shorthand will stop working until next full start command call)",
      `'platforma' docker compose service containers and volumes`
    ];
    const dirsToRemove: string[] = [state.path('data')];
    if (state.lastRun?.docker?.primaryPath) {
      dirsToRemove.push(state.lastRun!.docker!.primaryPath!);
    }
    if (state.lastRun?.process?.storagePath) {
      dirsToRemove.push(state.lastRun!.process!.storagePath!);
    }
    const storageWarns =
      dirsToRemove.length > 0
        ? `  - storages (you'll loose all projects and calculation results stored in the service instance):\n    - ${dirsToRemove.join('\n    - ')}`
        : '';

    var warnMessage = `
You are going to reset the state of platforma service
Things to be removed:
  - ${removeWarns.join('\n  - ')}
${storageWarns}
`;
    this.logger.warn(warnMessage);
    if (!util.askYN('Are you sure?')) {
      this.logger.info('Reset action was canceled');
      return;
    }

    const composeToDestroy = new Set<string>(pkg.composeFiles());
    if (state.lastRun?.docker?.composePath) {
      composeToDestroy.add(state.lastRun.docker.composePath);
    }

    for (const composeFile of composeToDestroy) {
      this.logger.info(`Destroying docker compose '${composeFile}'`);
      this.destroyDocker(composeFile, pkg.plImageTag());
    }

    for (const dir of dirsToRemove) {
      this.logger.info(`Destroying '${dir}'`);
      fs.rmSync(dir, { recursive: true, force: true });
    }

    this.logger.info(`Destroying state dir '${state.path()}'`);
    fs.rmSync(state.path(), { recursive: true, force: true });

    this.logger.info(
      `\nIf you want to remove all downloaded platforma binaries, delete '${pkg.binaries()}' dir manually\n`
    );
  }

  public mergeLicenseEnvs(flags: { license?: string; 'license-file'?: string }) {
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
    workdir: string
  ): types.authDriver[] | undefined {
    var authDrivers: types.authDriver[] = [];
    if (flags['auth-htpasswd-file']) {
      authDrivers.push({
        driver: 'htpasswd',
        path: path.resolve(workdir, flags['auth-htpasswd-file'])
      });
    }

    if (Boolean(flags['auth-ldap-server']) !== Boolean(flags['auth-ldap-default-dn'])) {
      throw new Error("LDAP auth settings require both 'server' and 'default DN' options to be set");
    }

    if (flags['auth-ldap-server']) {
      authDrivers.push({
        driver: 'ldap',
        serverUrl: flags['auth-ldap-server'],
        defaultDN: flags['auth-ldap-default-dn']!
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
    try {
      lastJwt = fs.readFileSync(jwtFile, { encoding });
    } catch (e: any) {}

    if (lastJwt == '') {
      lastJwt = util.randomStr(64);
      fs.writeFileSync(jwtFile, lastJwt, { encoding });
    }

    return lastJwt;
  }

  private destroyDocker(composePath: string, image: string) {
    const stubStoragePath = state.path('data', 'stub');
    const result = spawnSync('docker', ['compose', '--file', composePath, 'down', '--volumes', '--remove-orphans'], {
      env: {
        ...process.env,
        PL_IMAGE: 'scratch',

        PL_DATA_DB_ROOT: stubStoragePath,
        PL_DATA_PRIMARY_ROOT: stubStoragePath,
        PL_DATA_LIBRARY_ROOT: stubStoragePath,
        PL_DATA_WORKDIR_ROOT: stubStoragePath,
        PL_DATA_PACKAGE_ROOT: stubStoragePath,

        MINIO_IMAGE: 'scratch',
        MINIO_STORAGE: stubStoragePath
      },
      stdio: 'inherit'
    });

    if (result.status !== 0) process.exit(result.status);
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
        envs[`PL_DATA_${storageID}_TYPE`] = 'S3';
        envs[`PL_DATA_${storageID}_S3_BUCKET`] = storage.bucketName!;

        if (storage.endpoint) envs[`PL_DATA_${storageID}_S3_ENDPOINT`] = storage.endpoint;
        if (storage.presignEndpoint) envs[`PL_DATA_${storageID}_S3_PRESIGN_ENDPOINT`] = storage.presignEndpoint;
        if (storage.region) envs[`PL_DATA_${storageID}_S3_REGION`] = storage.region;
        if (storage.key) envs[`PL_DATA_${storageID}_S3_KEY`] = storage.key;
        if (storage.secret) envs[`PL_DATA_${storageID}_S3_SECRET`] = storage.secret;

        return envs;

      case 'FS':
        envs[`PL_DATA_${storageID}_TYPE`] = 'FS';

        return envs;

      default:
        util.assertNever(sType);
    }

    return {};
  }

  private readComposeFile(fPath: string): any {
    const yamlData = fs.readFileSync(fPath);
    return yaml.parse(yamlData.toString());
  }
  private writeComposeFile(fPath: string, data: any) {
    fs.writeFileSync(fPath, yaml.stringify(data));
  }
}

export function checkRunError(result: SpawnSyncReturns<Buffer>, message?: string) {
  if (result.error) {
    throw result.error;
  }

  const msg = message ?? 'failed to run command';

  if (result.status !== 0) {
    throw new Error(`${msg}, process exited with code '${result.status}'`);
  }
}

export type startLocalOptions = {
  version?: string;
  binaryPath?: string;
  configPath?: string;
  configOptions?: plCfg.plOptions;
  workdir?: string;

  primaryURL?: string;
  libraryURL?: string;
};

export type startLocalFSOptions = startLocalOptions;

export type startLocalS3Options = Omit<startLocalOptions, 'primaryURL' | 'libraryURL'> & {
  minioPort?: number;
  minioConsolePort?: number;
};
