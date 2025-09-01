import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type winston from 'winston';
import type { PackageConfig, Entrypoint, DockerPackage } from './package-info';
import { PackageInfo } from './package-info';
import {
  Renderer,
  readBuiltArtifactInfo,
  writeBuiltArtifactInfo,
} from './renderer';
import * as util from './util';
import * as archive from './archive';
import * as storage from './storage';
import * as docker from './docker';

export class Core {
  private readonly logger: winston.Logger;
  private _entrypoints: Map<string, Entrypoint> | undefined;
  private _renderer: Renderer | undefined;

  public readonly pkgInfo: PackageInfo;
  public buildMode: util.BuildMode;
  public targetPlatform: util.PlatformType | undefined;
  public allPlatforms: boolean = false;
  public fullDirHash: boolean;

  constructor(logger: winston.Logger, opts?: {
    pkgInfo?: PackageInfo;
    packageRoot?: string;
  }) {
    this.logger = logger;
    this.pkgInfo = opts?.pkgInfo ?? new PackageInfo(logger, { packageRoot: opts?.packageRoot });

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
      this._entrypoints = this.pkgInfo.entrypoints;
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

      const key = ep.package.type === 'docker' ? docker.entrypointName(ep.package.id) : ep.package.id;
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

    const dockerPkg = this.packages.get(docker.entrypointName(id));
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
    requireAllArtifacts?: boolean;
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
      requireAllArtifacts: options?.requireAllArtifacts,
      fullDirHash: this.fullDirHash,
    });

    for (const swJson of infos.values()) {
      this.renderer.writeEntrypointDescriptor(swJson);
    }

    for (const [epName, ep] of entrypoints) {
      if (ep.type === 'reference') {
        const srcPath = this.pkgInfo.resolveReference(epName, ep);
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

      if (pkg.type === 'docker') {
        continue;
      }

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
    }
  }

  // NOTE: each package build produces 2 artifacts:
  // - package itself in any shape (archive, docker image, etc)
  // - package location file, that contains address of the package in registry (docker tag, archive path and so on)
  //
  // package archive can be uploaded to the registry after build, when location is content-addressable
  //  (when unique content of archive produces unique location, i.e. hash of archive)
  // package location files are used to build entrypoint descriptor (sw.json file)
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
      if (pkg.type !== 'docker') {
        continue;
      }

      this.buildDockerImage(pkg.id, pkg);
    }
  }

  private buildDockerImage(pkgID: string, pkg: DockerPackage) {
    const dockerfile = path.resolve(this.pkgInfo.packageRoot, pkg.dockerfile ?? 'Dockerfile');
    const context = path.resolve(this.pkgInfo.packageRoot, pkg.context ?? '.');
    const entrypoint = pkg.entrypoint ?? [];

    if (!fs.existsSync(dockerfile)) {
      throw new Error(`Dockerfile '${dockerfile}' not found`);
    }

    if (!fs.existsSync(context)) {
      throw new Error(`Context '${context}' not found`);
    }

    const localTag = docker.generateLocalTagName(this.pkgInfo.packageRoot, pkg);

    this.logger.info(`Building docker image...`);
    this.logger.debug(`dockerfile: '${dockerfile}'
context: '${context}'
localTag: '${localTag}'
entrypoint: '${entrypoint.join('\', \'')}'
    `);

    docker.build(context, dockerfile, localTag, pkg.name, this.pkgInfo.version);

    const imageHash = docker.getImageHash(localTag);
    const dstTag = docker.generateRemoteTagName(pkg, imageHash);

    this.logger.debug(`Adding destination tag to docker image:
      dstTag: "${dstTag}"
    `);
    docker.addTag(localTag, dstTag);
    docker.removeTag(localTag);

    const artInfoPath = this.pkgInfo.artifactInfoLocation(pkgID, 'docker', util.currentArch());
    writeBuiltArtifactInfo(artInfoPath, {
      type: 'docker',
      platform: util.currentPlatform(),
      remoteArtifactLocation: dstTag,
    });

    this.logger.info(`Docker image is built:
  tag: '${dstTag}'
  location file: '${artInfoPath}'`);
  }

  private async createPackageArchive(
    packageContentType: string,
    pkg: PackageConfig,
    archivePath: string,
    contentRoot: string,
    os: util.OSType,
    arch: util.ArchType,
  ) {
    this.logger.debug(`  packing ${packageContentType} into a package`);
    if (pkg.crossplatform) {
      this.logger.debug(`    generating cross-platform package`);
    } else {
      this.logger.debug(`    generating package for os='${os}', arch='${arch}'`);
    }
    this.logger.debug(`    package content root: '${contentRoot}'`);
    this.logger.debug(`    package destination archive: '${archivePath}'`);

    await archive.create(this.logger, contentRoot, archivePath);

    const artInfoPath = this.pkgInfo.artifactInfoLocation(
      pkg.id,
      'archive',
      pkg.crossplatform ? undefined : util.joinPlatform(os, arch),
    );

    writeBuiltArtifactInfo(artInfoPath, {
      type: pkg.type,
      platform: util.joinPlatform(os, arch),
      registryURL: pkg.registry.downloadURL,
      registryName: pkg.registry.name,
      remoteArtifactLocation: pkg.namePattern,
      uploadPath: pkg.fullName(util.joinPlatform(os, arch)),
    });

    this.logger.info(`${packageContentType} archive is built:
  archive: '${archivePath}'
  location file: '${artInfoPath}'`);
  }

  public async publishPackages(options?: {
    ids?: string[];

    archivePath?: string;
    storageURL?: string;

    failExisting?: boolean; // do not warn if package already exists in storage, fail with error instead.
    forceReupload?: boolean; // re-upload packages even if they already exist in storage
  }) {
    const packagesToPublish = options?.ids ?? Array.from(this.buildablePackages.keys());
    this.logger.info(`Publishing packages: ${packagesToPublish.join(', ')}`);
    this.logger.info(`Publishable packages: ${Array.from(this.packages.keys()).join(', ')}`);

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

    const artInfoPath = this.pkgInfo.artifactInfoLocation(pkg.id, 'archive', pkg.crossplatform ? undefined : util.joinPlatform(os, arch));
    const artInfo = readBuiltArtifactInfo(artInfoPath);
    const dstName = artInfo.uploadPath ?? artInfo.remoteArtifactLocation;

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

    const s = await storage.initByUrl(storageURL, this.pkgInfo.packageRoot);

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
      if (pkg.type !== 'docker') {
        continue;
      }

      this.publishDockerImage(pkg);
    }
  }

  private publishDockerImage(pkg: PackageConfig) {
    if (pkg.type !== 'docker') {
      throw new Error(`package '${pkg.id}' is not a docker package`);
    }

    const artInfoPath = this.pkgInfo.artifactInfoLocation(pkg.id, 'docker', util.currentArch());
    const artInfo = readBuiltArtifactInfo(artInfoPath);
    const tag = artInfo.remoteArtifactLocation;

    // Because of turbo caching, we may face situation when no real docker build was executed on CI agent,
    // but image is already in remote registry. We should not fail in such scenarios, calmly skipping docker push step.

    const localImageExists = docker.localImageExists(tag);
    if (!localImageExists) {
      const remoteImageExists = docker.remoteImageExists(tag);

      if (remoteImageExists) {
        this.logger.info(`Docker image '${tag}' not exists locally but is already in remote registry. Skipping push...`);
        return;
      }

      throw new Error(`Docker image '${tag}' not exists locally and is not found in remote registry. Publication failed.`);
    }

    this.logger.info(`Publishing docker image '${tag}' into registry '${pkg.registry.name}'`);
    docker.push(tag);
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
      cwd: this.pkgInfo.packageRoot,
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
      this._renderer = new Renderer(this.logger, this.pkgInfo);
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
      packageRoot: this.pkgInfo.packageRoot,
      packageName: pkg.name,
      packageVersion: pkg.version,

      crossplatform: pkg.crossplatform,
      os: os,
      arch: arch,
      ext: archiveType,
    };
  }
}
