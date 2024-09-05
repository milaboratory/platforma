import {
  ChildProcess,
  SpawnSyncReturns,
  spawn,
  spawnSync
} from 'child_process';
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
    this.checkRunError(
      result,
      'failed to bring back Platforma Backend in the last started configuration'
    );
  }

  public startLocal(options?: startLocalOptions): ChildProcess {
    const cmd =
      options?.binaryPath ??
      platforma.binaryPath(options?.version, 'binaries', 'platforma');
    var configPath = options?.configPath;
    const workdir: string =
      options?.workdir ?? (configPath ? process.cwd() : pkg.state());

    if (options?.primaryURL) {
      options.configOptions = {
        ...options.configOptions,
        storages: {
          ...options.configOptions?.storages,
          primary: plCfg.storageSettingsFromURL(options.primaryURL, workdir)
        }
      };
    }
    if (options?.libraryURL) {
      options.configOptions = {
        ...options.configOptions,
        storages: {
          ...options.configOptions?.storages,
          library: plCfg.storageSettingsFromURL(options.libraryURL, workdir)
        }
      };
    }

    const configOptions = plCfg.loadDefaults(options?.configOptions);

    this.checkLicense(
      options?.configOptions?.license?.value,
      options?.configOptions?.license?.file
    );

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

    for (const dir of storageDirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    for (const drv of configOptions.core.auth.drivers) {
      if (drv.driver === 'htpasswd') {
        if (!fs.existsSync(drv.path)) {
          fs.copyFileSync(pkg.assets('users.htpasswd'), drv.path);
        }
      }
    }

    if (!configPath) {
      configPath = pkg.state('config-lastrun.yaml');
      fs.writeFileSync(configPath, plCfg.render(configOptions));
    }

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

  public startLocalFS(options?: startLocalFSOptions): ChildProcess {
    return this.startLocal(options);
  }

  public startLocalS3(options?: startLocalOptions): ChildProcess {
    if (!options?.libraryURL || !options?.primaryURL) {
      this.startMinio();
    }

    if (!options?.primaryURL) {
      options = {
        ...options,
        primaryURL:
          's3e://testuser:testpassword@localhost:9000/main-bucket/?region=fake-region'
      };
    }
    if (!options?.libraryURL) {
      options = {
        ...options,
        libraryURL:
          's3e://testuser:testpassword@localhost:9000/library-bucket/?region=fake-region'
      };
    }

    return this.startLocal(options);
  }

  public startMinio(options?: {
    storage?: string;
    image?: string;
    version?: string;
  }) {
    var composeMinioSrc = pkg.assets('compose-minio.yaml');
    var composeMinioDst = pkg.state('compose-minio.yaml');

    const version = options?.version ? `:${options.version!}` : '';
    const image = options?.image ?? `quay.io/minio/minio${version}`;

    const storage = options?.storage;

    const envs = {
      MINIO_IMAGE: image,
      MINIO_STORAGE: ''
    };
    const compose = this.readComposeFile(composeMinioSrc);

    if (storage) {
      fs.mkdirSync(path.resolve(storage), { recursive: true });
      envs['MINIO_STORAGE'] = path.resolve(storage);
    } else {
      compose.volumes.storage = null;
    }

    this.writeComposeFile(composeMinioDst, compose);

    const result = spawnSync(
      'docker',
      [
        'compose',
        `--file=${composeMinioDst}`,
        'up',
        '--detach',
        '--remove-orphans',
        '--pull=missing'
      ],
      {
        env: {
          ...process.env,
          ...envs
        },
        stdio: 'inherit'
      }
    );

    this.checkRunError(result, 'failed to start MinIO service in docker');
  }

  public buildPlatforma(options: {
    repoRoot: string;
    binPath?: string;
  }): string {
    const cmdPath: string = path.resolve(options.repoRoot, 'cmd', 'platforma');
    const binPath: string =
      options.binPath ?? path.join(os.tmpdir(), 'platforma-local-build');

    this.logger.info('Building Platforma Backend binary from sources');
    this.logger.info(`  sources path: ${options.repoRoot}`);
    this.logger.info(`  binary path: ${binPath}`);

    const result = spawnSync('go', ['build', '-o', binPath, '.'], {
      cwd: cmdPath,
      stdio: 'inherit'
    });

    this.checkRunError(
      result,
      "failed to build platforma binary from sources using 'go build' command"
    );
    return binPath;
  }

  public startDockerS3(options?: {
    image?: string;
    version?: string;
    primaryURL?: string;
    auth?: types.authOptions;
    license?: string;
    licenseFile?: string;
  }) {
    const composeS3Path = pkg.assets('compose-s3.yaml');
    const image = options?.image ?? pkg.plImageTag(options?.version);

    this.checkLicense(options?.license, options?.licenseFile);

    const envs: NodeJS.ProcessEnv = {
      PL_IMAGE: image,
      PL_AUTH_HTPASSWD_PATH: pkg.assets('users.htpasswd'),
      PL_LICENSE: options?.license,
      PL_LICENSE_FILE: options?.licenseFile
    };

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

    if (options?.primaryURL) {
      const primary = plCfg.storageSettingsFromURL(options.primaryURL, '.');

      if (primary.type === 'S3') {
        envs['PLC_FILE_PRIMARY_S3_BUCKET'] = primary.bucketName!;

        if (primary.endpoint)
          envs['PLC_FILE_PRIMARY_S3_ENDPOINT'] = primary.endpoint;
        if (primary.presignEndpoint)
          envs['PLC_FILE_PRIMARY_S3_PRESIGN_ENDPOINT'] =
            primary.presignEndpoint;
        if (primary.key) envs['PLC_FILE_PRIMARY_S3_KEY'] = primary.key;
        if (primary.secret) envs['PLC_FILE_PRIMARY_S3_SECRET'] = primary.secret;
        if (primary.region) envs['PLC_FILE_PRIMARY_S3_REGION'] = primary.region;
      } else {
        throw new Error(
          "primary storage must have 'S3' type in 'docker s3' configuration"
        );
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

    this.checkRunError(result, 'failed to start Platforma Backend in Docker');
    state.isActive = true;
  }

  public startDockerFS(options?: {
    primaryStorage?: string;
    workStorage?: string;
    libraryStorage?: string;
    image?: string;
    version?: string;
    auth?: types.authOptions;
    license?: string;
    licenseFile?: string;
  }) {
    var composeFSPath = pkg.assets('compose-fs.yaml');
    var composeRunPath = pkg.state('compose-fs.yaml');
    const image = options?.image ?? pkg.plImageTag(options?.version);
    const primaryStorage =
      options?.primaryStorage ?? state.lastRun?.docker?.primaryPath;
    const workStorage = options?.workStorage ?? state.lastRun?.docker?.workPath;
    const libraryStorage =
      options?.libraryStorage ?? state.lastRun?.docker?.libraryPath;

    this.checkLicense(options?.license, options?.licenseFile);
    this.checkVolumeConfig(
      'primary',
      primaryStorage,
      state.lastRun?.docker?.primaryPath
    );
    this.checkVolumeConfig(
      'library',
      libraryStorage,
      state.lastRun?.docker?.libraryPath
    );

    const envs: NodeJS.ProcessEnv = {
      PL_IMAGE: image,
      PL_AUTH_HTPASSWD_PATH: pkg.assets('users.htpasswd'),
      PL_LICENSE: options?.license,
      PL_LICENSE_FILE: options?.licenseFile
    };
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

    if (primaryStorage) {
      fs.mkdirSync(path.resolve(primaryStorage), { recursive: true });
      envs['PL_STORAGE_PRIMARY'] = path.resolve(primaryStorage);
    } else {
      compose.volumes.primary = null;
    }

    if (workStorage) {
      fs.mkdirSync(path.resolve(workStorage), { recursive: true });
      envs['PL_STORAGE_PRIMARY'] = path.resolve(workStorage);
    } else {
      compose.volumes.work = null;
    }

    if (libraryStorage) {
      envs['PL_STORAGE_LIBRARY'] = path.resolve(libraryStorage);
    } else {
      compose.volumes.library = null;
    }

    this.writeComposeFile(composeRunPath, compose);

    const result = run.runDocker(
      this.logger,
      [
        'compose',
        `--file=${composeFSPath}`,
        'up',
        '--detach',
        '--remove-orphans',
        '--pull=missing',
        'backend'
      ],
      {
        env: envs,
        stdio: 'inherit'
      },
      {
        plImage: image,
        composePath: composeFSPath,
        primaryPath: primaryStorage ? path.resolve(primaryStorage) : '',
        workPath: workStorage ? path.resolve(workStorage) : '',
        libraryPath: libraryStorage ? path.resolve(libraryStorage) : ''
      }
    );

    this.checkRunError(result, 'failed to start Platforma Backend in Docker');
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
        const result = spawnSync(
          'docker',
          ['compose', '--file', lastRun.docker!.composePath!, 'down'],
          {
            env: {
              ...process.env,
              ...lastRun.envs
            },
            stdio: 'inherit'
          }
        );
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
    const dirsToRemove: string[] = [];
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

    this.logger.info(`Destroying state dir '${pkg.state()}'`);
    fs.rmSync(pkg.state(), { recursive: true, force: true });

    this.logger.info(
      `\nIf you want to remove all downloaded platforma binaries, delete '${pkg.binaries()}' dir manually\n`
    );
  }

  public mergeLicenseEnvs(flags: {
    license?: string;
    'license-file'?: string;
  }) {
    if (flags.license === undefined) {
      if ((process.env.MI_LICENSE ?? '') != '')
        flags.license = process.env.MI_LICENSE;
      else if ((process.env.PL_LICENSE ?? '') != '')
        flags.license = process.env.PL_LICENSE;
    }

    // set 'license-file' only if license is still undefined
    if (flags['license-file'] === undefined && flags.license === undefined) {
      if ((process.env.MI_LICENSE_FILE ?? '') != '')
        flags['license-file'] = process.env.MI_LICENSE_FILE;
      else if ((process.env.PL_LICENSE_FILE ?? '') != '')
        flags['license-file'] = process.env.PL_LICENSE_FILE;
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

    if (
      Boolean(flags['auth-ldap-server']) !==
      Boolean(flags['auth-ldap-default-dn'])
    ) {
      throw new Error(
        "LDAP auth settings require both 'server' and 'default DN' options to be set"
      );
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

    return [
      { driver: 'jwt', key: util.randomStr(32) },
      ...authDrivers
    ] as types.authDriver[];
  }

  private destroyDocker(composePath: string, image: string) {
    const result = spawnSync(
      'docker',
      [
        'compose',
        '--file',
        composePath,
        'down',
        '--volumes',
        '--remove-orphans'
      ],
      {
        env: {
          ...process.env,
          PL_IMAGE: 'scratch',
          PL_STORAGE_PRIMARY: '',
          PL_STORAGE_WORK: '',
          PL_STORAGE_LIBRARY: '',
          PL_AUTH_HTPASSWD_PATH: '.',

          MINIO_IMAGE: 'scratch',
          MINIO_STORAGE: ''
        },
        stdio: 'inherit'
      }
    );

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

  private checkVolumeConfig(
    volumeID: string,
    newPath?: string,
    lastRunPath?: string
  ) {
    if (newPath === undefined) {
      return;
    }
    if (lastRunPath === undefined) {
      return;
    }

    if (path.resolve(newPath) == path.resolve(lastRunPath)) {
      return;
    }

    this.logger.error(
      `'${volumeID}' storage is given to Platforma Backend as docker volume.\n` +
        `Docker Compose does not migrate volumes on itself. It seems you used different path for '${volumeID}' storage earlier.\n` +
        `  current bind path: '${lastRunPath}'\n` +
        `  new bind path:     '${path.resolve(newPath)}'\n` +
        `Your '${volumeID}' storage path change would not have effect until reset (pl-service reset)`
    );
    throw new Error(`cannot change '${volumeID}' storage path`);
  }

  private readComposeFile(fPath: string): any {
    const yamlData = fs.readFileSync(fPath);
    return yaml.parse(yamlData.toString());
  }
  private writeComposeFile(fPath: string, data: any) {
    fs.writeFileSync(fPath, yaml.stringify(data));
  }

  private checkRunError(result: SpawnSyncReturns<Buffer>, message?: string) {
    if (result.error) {
      throw result.error;
    }

    const msg = message ?? 'failed to run command';

    if (result.status !== 0) {
      throw new Error(`${msg}, process exited with code '${result.status}'`);
    }
  }
}

export type startLocalFSOptions = {
  version?: string;
  binaryPath?: string;
  configPath?: string;
  configOptions?: plCfg.plOptions;
  workdir?: string;
};

export type startLocalOptions = startLocalFSOptions & {
  primaryURL?: string;
  libraryURL?: string;
};
