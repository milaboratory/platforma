import fs from 'node:fs';
import path from 'node:path';
// import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import type winston from 'winston';
import type { PackageConfig, Entrypoint, DockerPackage, PythonPackage } from './package-info';
import { PackageInfo } from './package-info';
import {
  Renderer,
  listPackageEntrypoints,
  readEntrypointDescriptor,
} from './renderer';
import * as util from './util';
import * as archive from './archive';
import * as storage from './storage';
import { contextFullPath, dockerBuild, dockerEntrypointName, dockerfileFullPath, dockerPush, dockerTagFromPackage } from './docker';
import { preparePythonDockerOptions } from './python-docker';

export class Core {
  private readonly logger: winston.Logger;
  private _entrypoints: Map<string, Entrypoint> | undefined;
  private _renderer: Renderer | undefined;

  public readonly pkg: PackageInfo;
  public buildMode: util.BuildMode;
  public targetPlatform: util.PlatformType | undefined;
  public allPlatforms: boolean = false;
  public fullDirHash: boolean;

  constructor(logger: winston.Logger, opts?: {
    pkgInfo?: PackageInfo;
    packageRoot?: string;
  }) {
    this.logger = logger;
    this.pkg = opts?.pkgInfo ?? new PackageInfo(logger, { packageRoot: opts?.packageRoot });

    this.buildMode = 'release';

    this.fullDirHash = false;
  }

  public binArchivePath(pkg: PackageConfig, os: util.OSType, arch: util.ArchType): string {
    return archive.getPath(this.archiveOptions(pkg, os, arch, 'tgz'));
  }

  public assetArchivePath(pkg: PackageConfig, os: util.OSType, arch: util.ArchType): string {
    return archive.getPath(this.archiveOptions(pkg, os, arch, 'zip'));
  }

  public archivePath(pkg: PackageConfig, os: util.OSType, arch: util.ArchType): string {
    if (pkg.type === 'asset') {
      return this.assetArchivePath(pkg, os, arch);
    }

    return this.binArchivePath(pkg, os, arch);
  }

  public get entrypoints(): Map<string, Entrypoint> {
    if (!this._entrypoints) {
      this._entrypoints = this.pkg.entrypoints;
    }

    return this._entrypoints;
  }

  public get packages(): Map<string, PackageConfig> {
    const pkgs = new Map<string, PackageConfig>();

    for (const [_, ep] of this.entrypoints.entries()) {
      if (ep.type === 'reference') {
        // References have no pacakge definitions inside
        continue;
      }

      const key = ep.package.type === 'docker' ? dockerEntrypointName(ep.package.id) : ep.package.id;
      pkgs.set(key, ep.package);
    }

    return pkgs;
  }

  public get packageEntrypointsIndex(): Map<string, string[]> {
    const result = new Map<string, string[]>();

    for (const [epName, ep] of this.entrypoints) {
      if (ep.type === 'reference') {
        // References have no pacakge definitions inside
        continue;
      }

      if (!result.has(ep.package.id)) {
        result.set(ep.package.id, []);
      }

      result.get(ep.package.id)!.push(epName);
    }

    return result;
  }

  public get buildablePackages(): Map<string, PackageConfig> {
    return new Map(Array.from(this.packages.entries()).filter(([, value]) => value.isBuildable));
  }

  public getPackage(id: string): PackageConfig {
    const pkg = this.packages.get(id);
    if (pkg) {
      return pkg;
    }

    const dockerPkg = this.packages.get(dockerEntrypointName(id));
    if (dockerPkg) {
      return dockerPkg;
    }

    this.logger.error(`package with id '${id}' not found in ${util.softwareConfigName} file`);
    throw new Error(`no package with id '${id}'`);
  }

  /** Parses entrypoints from a package.json
   * (if entrypoints don't passed directly),
   * transforms them to local or release (depending on `buildMode`) descriptors,
   * writes descriptors to ./dist/tengo/sw.json or as.json next to the given package.json. */
  public buildDescriptors(options?: {
    packageIds?: string[];
    entrypoints?: string[];
    sources?: util.SoftwareSource[];
  }) {
    const index = this.packageEntrypointsIndex;

    const entrypointNames = options?.entrypoints ?? [];
    if (options?.packageIds) {
      for (const pkgId of options.packageIds) {
        const packageEntrypoints = index.get(pkgId);
        if (!packageEntrypoints || packageEntrypoints.length === 0) {
          throw new Error(
            `cannot build descriptor for package ${pkgId}: no entrypoints found for package`,
          );
        }

        entrypointNames.push(...packageEntrypoints);
      }
    }

    let entrypoints = Array.from(this.entrypoints.entries());
    if (entrypointNames.length > 0) {
      entrypoints = entrypoints.filter(([epName, _]) => entrypointNames.includes(epName));
    }

    const infos = this.renderer.renderSoftwareEntrypoints(this.buildMode, new Map(entrypoints), {
      fullDirHash: this.fullDirHash,
    });

    for (const swJson of infos.values()) {
      this.renderer.writeEntrypointDescriptor(swJson);
    }

    for (const [epName, ep] of entrypoints) {
      if (ep.type === 'reference') {
        const srcPath = this.pkg.resolveReference(epName, ep);
        this.renderer.copyEntrypointDescriptor(epName, srcPath);
      }
    }
  }

  public async buildPackages(options?: {
    ids?: string[];
    forceBuild?: boolean;

    archivePath?: string;
    contentRoot?: string;
    skipIfEmpty?: boolean;
  }) {
    const packagesToBuild = options?.ids ?? Array.from(this.buildablePackages.keys());

    if (packagesToBuild.length > 1 && options?.archivePath && !options.forceBuild) {
      this.logger.error(
        'Attempt to build several packages targeting single package archive. This will simply overwrite the archive several times. If you know what you are doing, add \'--force\' flag',
      );
      throw new Error('attempt to build several packages using the same software package archive');
    }

    for (const pkgID of packagesToBuild) {
      const pkg = this.getPackage(pkgID);

      if (pkg.crossplatform) {
        await this.buildPackage(pkg, util.currentPlatform(), options);
      } else if (this.targetPlatform) {
        await this.buildPackage(pkg, this.targetPlatform, options);
      } else if (this.allPlatforms && !pkg.isMultiroot) {
        const currentPlatform = util.currentPlatform();
        this.logger.warn(
          `packages are requested to be build for all supported platforms, but package '${pkgID}' has single archive root for all platforms and will be built only for '${currentPlatform}'`,
        );
        await this.buildPackage(pkg, currentPlatform, options);
      } else if (this.allPlatforms) {
        for (const platform of pkg.platforms) {
          await this.buildPackage(pkg, platform, options);
        }
      } else {
        await this.buildPackage(pkg, util.currentPlatform(), options);
      }

      const dockerPkg = this.packages.get(dockerEntrypointName(pkg.id));
      if (!dockerPkg) {
        continue;
      }

      if (dockerPkg.type === 'docker') {
        this.buildDockerImage(dockerPkg);
      }
    }
  }

  public async buildPackage(
    pkg: PackageConfig,
    platform: util.PlatformType,
    options?: {
      archivePath?: string;
      contentRoot?: string;
      skipIfEmpty?: boolean;
    },
  ) {
    this.logger.info(`Building software package '${pkg.id}' for platform '${platform}'...`);
    const { os, arch } = util.splitPlatform(platform);

    if (!pkg.isBuildable) {
      if (options?.skipIfEmpty) {
        this.logger.info(`  archive build was skipped: package '${pkg.id}' is not buildable`);
      }
      this.logger.error(
        `  not buildable: artifact '${pkg.id}' archive build is impossible for configuration inside '${util.softwareConfigName}'`,
      );
      throw new Error('not a buildable artifact');
    }

    if (pkg.type === 'docker') {
      this.buildDockerImage(pkg);
      return;
    }

    if (pkg.type === 'python') {
      this.buildPythonDockerImage(pkg);
      return;
    }

    const contentRoot = options?.contentRoot ?? pkg.contentRoot(platform);

    if (pkg.type === 'asset') {
      const archivePath = options?.archivePath ?? this.assetArchivePath(pkg, os, arch);
      await this.createPackageArchive('assets', pkg, archivePath, contentRoot, os, arch);
      return;
    }

    if (this.buildMode === 'dev-local') {
      this.logger.info(
        `  no need to build software archive in '${this.buildMode}' mode: archive build was skipped`,
      );
      return;
    }

    const archivePath = options?.archivePath ?? this.binArchivePath(pkg, os, arch);

    await this.createPackageArchive('software', pkg, archivePath, contentRoot, os, arch);
  }

  public buildDockerImages(
    options?: {
      ids?: string[];
    },
  ) {
    const packagesToBuild = options?.ids ?? Array.from(this.buildablePackages.keys());

    for (const pkgID of packagesToBuild) {
      const pkg = this.getPackage(pkgID);
      switch (pkg.type) {
        case 'docker':
          this.buildDockerImage(pkg);
          break;
        case 'python':
          this.buildPythonDockerImage(pkg);
          break;
        default:
          this.logger.debug(`Package '${pkg.id}' is not a 'docker' or 'python' package type, skipping build docker image`);
          break;
      }
    }
  }

  private buildDockerImage(buildParams: DockerPackage) {
    const dockerfile = dockerfileFullPath(this.pkg.packageRoot, buildParams);
    const context = contextFullPath(this.pkg.packageRoot, buildParams);
    const entrypoint = buildParams.entrypoint ?? [];

    if (!fs.existsSync(dockerfile)) {
      throw new Error(`Dockerfile '${dockerfile}' not found`);
    }

    if (!fs.existsSync(context)) {
      throw new Error(`Context '${context}' not found`);
    }

    const tag = dockerTagFromPackage(this.pkg.packageRoot, buildParams);

    this.logger.info(`Building docker image:
      dockerfile: "${dockerfile}"
      context: "${context}"
      tag: "${tag}"
      entrypoint: "${entrypoint.join(' ')}"
    `);

    dockerBuild(context, dockerfile, tag);

    this.logger.info(`Docker image '${tag}' was built successfully`);
  }

  private buildPythonDockerImage(buildParams: PythonPackage) {
    // if (os.platform() !== 'linux') {
    //   this.logger.info('Skipping Python Docker build on non-Linux platform');
    //   return;
    // }

    const options = preparePythonDockerOptions(this.logger, this.pkg.packageRoot, buildParams);

    this.logger.info(`Building Python Docker image for package '${buildParams.name}' with options: 
      ${Object.entries(options).map(([key, value]) => `  ${key}: '${value}'`).join('\n')}`,
    );

    dockerBuild(options.context, options.dockerfile, options.tag);
    options.cleanup();

    this.logger.info(`Python Docker image '${options.tag}' was built successfully`);
  }

  private async createPackageArchive(
    packageContentType: string,
    pkg: PackageConfig,
    archivePath: string,
    contentRoot: string,
    os: string,
    arch: string,
  ) {
    this.logger.info(`  packing ${packageContentType} into a package`);
    if (pkg.crossplatform) {
      this.logger.info(`    generating cross-platform package`);
    } else {
      this.logger.info(`    generating package for os='${os}', arch='${arch}'`);
    }
    this.logger.debug(`    package content root: '${contentRoot}'`);
    this.logger.debug(`    package destination archive: '${archivePath}'`);

    await archive.create(this.logger, contentRoot, archivePath);

    this.logger.info(`  ${packageContentType} package was written to '${archivePath}'`);
  }

  public publishDescriptors(options?: { npmPublishArgs?: string[] }) {
    const names = listPackageEntrypoints(this.pkg.packageRoot);

    if (names.length === 0) {
      throw new Error(
        `No software entrypoints found in package during 'publish descriptors' action. Nothing to publish`,
      );
    }

    for (const epInfo of names) {
      const epDescr = readEntrypointDescriptor(this.pkg.packageName, epInfo.name, epInfo.path);
      if (epDescr.isDev) {
        this.logger.error(
          'You are trying to publish entrypoint descriptor generated in \'dev\' mode. This software would not be accepted for execution by any production environment.',
        );
        throw new Error('attempt to publish \'dev\' entrypoint descriptor');
      }
    }

    this.logger.info('Running \'npm publish\' to publish NPM package with entrypoint descriptors...');

    const args = ['publish'];
    if (options?.npmPublishArgs) {
      args.push(...options.npmPublishArgs);
    }

    const result = spawnSync('npm', args, { stdio: 'inherit', cwd: this.pkg.packageRoot });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error('\'npm publish\' failed with non-zero exit code');
    }
  }

  public async publishPackages(options?: {
    ids?: string[];
    ignoreArchiveOverlap?: boolean;

    archivePath?: string;
    storageURL?: string;

    failExisting?: boolean;
    forceReupload?: boolean;
  }) {
    const packagesToPublish = options?.ids ?? Array.from(this.buildablePackages.keys());
    this.logger.info(`Publishing packages: ${packagesToPublish.join(', ')}`);
    this.logger.info(`Publishable packages: ${Array.from(this.packages.keys()).join(', ')}`);

    if (packagesToPublish.length > 1 && options?.archivePath && !options.ignoreArchiveOverlap) {
      this.logger.error(
        'Attempt to publish several pacakges using single package archive. This will upload the same archive under several different names. If you know what you are doing, add \'--force\' flag',
      );
      throw new Error(
        'attempt to publish several packages using the same software package archive',
      );
    }

    const uploads: Promise<void>[] = [];
    for (const pkgID of packagesToPublish) {
      const pkg = this.getPackage(pkgID);

      if (pkg.crossplatform) {
        uploads.push(this.publishPackage(pkg, util.currentPlatform(), options));
      } else if (this.targetPlatform) {
        uploads.push(this.publishPackage(pkg, this.targetPlatform, options));
      } else if (this.allPlatforms) {
        for (const platform of pkg.platforms) {
          uploads.push(this.publishPackage(pkg, platform, options));
        }
      } else {
        uploads.push(this.publishPackage(pkg, util.currentPlatform(), options));
      }

      if (pkg.type !== 'docker') {
        // will check that docker package exists in the same package.sw.json file for entrypoints with
        // different artifact types
        const dockerPkg = this.packages.get(dockerEntrypointName(pkg.id));
        if (!dockerPkg) {
          continue;
        }
        // if (!dockerPkg) {
        //   // For Python packages without custom docker config, publish the auto-generated Docker image
        //   if (pkg.type === 'python') {
        //     const imageInfo = this._pythonDockerImages.get(pkg.name);
        //     if (imageInfo) {
        //       this.logger.info(`Publishing auto-generated Python Docker image '${imageInfo.tag}' for package '${pkg.name}'`);
        //       try {
        //         dockerPush(imageInfo.tag);
        //         this.logger.info(`Python Docker image '${imageInfo.tag}' published successfully`);
        //       } catch (error) {
        //         this.logger.warn(`Failed to publish Python Docker image '${imageInfo.tag}': ${String(error)}`);
        //       }
        //     }
        //   }
        //   continue;
        // }

        this.publishDockerImage(dockerPkg);
      }
    }

    return Promise.all(uploads);
  }

  private async publishPackage(
    pkg: PackageConfig,
    platform: util.PlatformType,
    options?: {
      archivePath?: string;
      storageURL?: string;

      failExisting?: boolean;
      forceReupload?: boolean;
    },
  ) {
    if (pkg.type === 'docker') {
      this.publishDockerImage(pkg);
      return;
    }

    await this.publishArchive(pkg, platform, options);
  }

  private async publishArchive(pkg: PackageConfig, platform: util.PlatformType, options?: {
    archivePath?: string;
    storageURL?: string;
    failExisting?: boolean;
    forceReupload?: boolean;
  }) {
    const { os, arch } = util.splitPlatform(platform);

    const storageURL = options?.storageURL ?? pkg.registry.storageURL;

    const archivePath = options?.archivePath ?? this.archivePath(pkg, os, arch);

    const dstName = pkg.fullName(platform);

    if (!storageURL) {
      const regNameUpper = pkg.registry.name.toUpperCase().replaceAll(/[^A-Z0-9_]/g, '_');
      this.logger.error(`no storage URL is set for registry ${pkg.registry.name}`);
      throw new Error(
        `'registry.storageURL' of package '${pkg.id}' is empty. Set it as command option, in '${util.softwareConfigName}' file or via environment variable 'PL_REGISTRY_${regNameUpper}_UPLOAD_URL'`,
      );
    }

    const signatureSuffixes = this.findSignatures(archivePath);

    this.logger.info(
      `Publishing package '${pkg.name}' for platform '${platform}' into registry '${pkg.registry.name}'`,
    );
    this.logger.debug(`  registry storage URL: '${storageURL}'`);
    this.logger.debug(`  archive to publish: '${archivePath}'`);
    if (signatureSuffixes.length > 0)
      this.logger.debug(`  detected signatures: ${signatureSuffixes.join(', ')}`);
    this.logger.debug(`  target package name: '${dstName}'`);

    const s = await storage.initByUrl(storageURL, this.pkg.packageRoot);

    const exists = await s.exists(dstName);
    if (exists && !options?.forceReupload) {
      if (options?.failExisting) {
        throw new Error(
          `software package '${dstName}' already exists in registry '${pkg.registry.name}'. To re-upload it, use 'force' flag. To not fail, remove 'fail-existing-packages' flag`,
        );
      }

      this.logger.warn(
        `software package '${dstName}' already exists in registry '${pkg.registry.name}'. Upload was skipped.`,
      );
      return;
    }

    const uploads: Promise<void>[] = [];

    const archive = fs.createReadStream(archivePath);
    uploads.push(
      s.putFile(dstName, archive).finally(() => {
        archive.close();
        return;
      }),
    );

    for (const sig of signatureSuffixes) {
      const signature = fs.createReadStream(`${archivePath}${sig}`);
      uploads.push(
        s.putFile(`${dstName}${sig}`, signature).finally(() => {
          signature.close();
          return;
        }),
      );
    }

    return Promise.all(uploads).then(() => {
      this.logger.info(`Package '${pkg.name}' was published to '${pkg.registry.name}:${dstName}'`);
      return;
    });
  }

  public publishDockerImages(options?: {
    ids?: string[];
  }) {
    const packagesToPublish = options?.ids ?? Array.from(this.buildablePackages.keys());

    for (const pkgID of packagesToPublish) {
      const pkg = this.getPackage(pkgID);
      switch (pkg.type) {
        case 'docker':
          this.publishDockerImage(pkg);
          break;
        case 'python':
          this.publishPythonDockerImage(pkg);
          break;
        default:
          this.logger.warn(`Package '${pkg.id}' is not a 'docker' or 'python' package type, skipping publish docker image`);
          break;
      }
    }
  }

  private publishDockerImage(pkg: PackageConfig) {
    if (pkg.type !== 'docker') {
      throw new Error(`package '${pkg.id}' is not a docker package`);
    }

    const tag = dockerTagFromPackage(this.pkg.packageRoot, pkg);
    dockerPush(tag);

    this.logger.info(`Publishing docker image '${tag}' into registry '${pkg.registry.name}'`);
  }

  private publishPythonDockerImage(pkg: PackageConfig) {
    if (pkg.type !== 'python') {
      throw new Error(`package '${pkg.id}' is not a python package`);
    }
    // // Publish Python Docker images that were built during the build process
    // const imageInfo = this._pythonDockerImages.get(pkg.name);
    // if (!imageInfo) {
    //   throw new Error(`Python Docker image not found for package '${pkg.name}'`);
    // }

    // this.logger.info(`Publishing Python Docker image '${imageInfo.tag}' for package '${pkg.name}'`);
    // try {
    //   dockerPush(imageInfo.tag);
    //   this.logger.info(`Python Docker image '${imageInfo.tag}' published successfully`);
    // } catch (error) {
    //   this.logger.warn(`Failed to publish Python Docker image '${imageInfo.tag}': ${String(error)}`);
    // }
  }

  public signPackages(options?: {
    ids?: string[];

    archivePath?: string;
    signCommand?: string;
  }) {
    const packagesToSign = options?.ids ?? Array.from(this.buildablePackages.keys());

    if (packagesToSign.length > 1 && options?.archivePath) {
      this.logger.warn(
        'Call of \'sign\' action for several packages targeting single package archive.',
      );
    }

    const uploads: Promise<void>[] = [];
    for (const pkgID of packagesToSign) {
      const pkg = this.getPackage(pkgID);

      if (pkg.crossplatform) {
        this.signPackage(pkg, util.currentPlatform(), options);
      } else if (this.targetPlatform) {
        this.signPackage(pkg, this.targetPlatform, options);
      } else if (this.allPlatforms) {
        for (const platform of pkg.platforms) {
          this.signPackage(pkg, platform, options);
        }
      } else {
        this.signPackage(pkg, util.currentPlatform(), options);
      }
    }

    return Promise.all(uploads);
  }

  private signPackage(
    pkg: PackageConfig,
    platform: util.PlatformType,
    options?: {
      archivePath?: string;
      signCommand?: string;
    },
  ) {
    if (!options?.signCommand) {
      throw new Error(
        'current version of pl-package-builder supports only package signature with external utility. Provide \'sign command\' option to sign package',
      );
    }
    const signCommand: unknown = JSON.parse(options.signCommand);
    const commandFormatIsValid
      = Array.isArray(signCommand) && signCommand.every((item) => typeof item === 'string');
    if (!commandFormatIsValid) {
      throw new Error(
        'sign command must be valid JSON array with command and arguments (["cmd", "arg", "arg", "..."])',
      );
    }

    const { os, arch } = util.splitPlatform(platform);

    const archivePath = options?.archivePath ?? this.archivePath(pkg, os, arch);
    const toExecute = signCommand.map((v: string) => v.replaceAll('{pkg}', archivePath));

    this.logger.info(`Signing package '${pkg.name}' for platform '${platform}'...`);
    this.logger.debug(`  archive: '${archivePath}'`);
    this.logger.debug(`  sign command: ${JSON.stringify(toExecute)}`);

    const result = spawnSync(toExecute[0], toExecute.slice(1), {
      stdio: 'inherit',
      cwd: this.pkg.packageRoot,
    });
    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      throw new Error(`${JSON.stringify(toExecute)} failed with non-zero exit code`);
    }
  }

  /**
   * Get list of actual signature suffiexes existing for given archive
   */
  private findSignatures(archivePath: string): string[] {
    const signSuffixes: string[] = ['.sig', '.p7s'];
    const dirName = path.dirname(archivePath);
    const archiveName = path.basename(archivePath);

    const files = fs.readdirSync(dirName);

    const foundSuffixes: string[] = [];
    files.map((fileName: string) => {
      for (const suffix of signSuffixes) {
        if (fileName === `${archiveName}${suffix}`) {
          foundSuffixes.push(suffix);
        }
      }
    });
    return foundSuffixes;
  }

  private get renderer(): Renderer {
    if (!this._renderer) {
      this._renderer = new Renderer(this.logger, this.pkg.packageName, this.pkg.packageRoot);
    }

    return this._renderer;
  }

  private archiveOptions(
    pkg: PackageConfig,
    os: util.OSType,
    arch: util.ArchType,
    archiveType: archive.archiveType,
  ): archive.archiveOptions {
    return {
      packageRoot: this.pkg.packageRoot,
      packageName: pkg.name,
      packageVersion: pkg.version,

      crossplatform: pkg.crossplatform,
      os: os,
      arch: arch,
      ext: archiveType,
    };
  }
}
