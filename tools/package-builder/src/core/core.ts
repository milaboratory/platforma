import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import yaml from 'yaml';
import type winston from 'winston';

import * as defaults from '../defaults';
import { PackageInfo } from './package-info';
import * as artifacts from './schemas/artifacts';
import type * as entrypoint from './schemas/entrypoints';
import { micromamba } from './conda/builder';
import {
  SwJsonRenderer,
  readBuiltArtifactInfo,
  writeBuiltArtifactInfo,
} from './sw-json-render';
import * as util from './util';
import * as archive from './archive';
import * as storage from './storage';
import * as docker from './docker';
import { tmpSpecFile } from './docker-conda';

export class Core {
  private readonly logger: winston.Logger;
  private _entrypoints: Map<string, entrypoint.Entrypoint> | undefined;
  private _renderer: SwJsonRenderer | undefined;

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

  public binArchivePath(artifact: artifacts.withId<artifacts.anyType>, os: util.OSType, arch: util.ArchType): string {
    const name = this.pkgInfo.artifactName(artifact);
    const version = this.pkgInfo.artifactVersion(artifact);
    return archive.getPath(this.archiveOptions(artifact, name, version, os, arch, 'tgz'));
  }

  public assetArchivePath(artifact: artifacts.withId<artifacts.anyType>, os: util.OSType, arch: util.ArchType): string {
    const name = this.pkgInfo.artifactName(artifact);
    const version = this.pkgInfo.artifactVersion(artifact);
    return archive.getPath(this.archiveOptions(artifact, name, version, os, arch, 'zip'));
  }

  public archivePath(artifact: artifacts.withId<artifacts.anyType>, os: util.OSType, arch: util.ArchType): string {
    if (artifact.type === 'asset') {
      return this.assetArchivePath(artifact, os, arch);
    }

    return this.binArchivePath(artifact, os, arch);
  }

  public get entrypoints(): Map<string, entrypoint.Entrypoint> {
    if (!this._entrypoints) {
      this._entrypoints = this.pkgInfo.entrypoints;
    }

    return this._entrypoints;
  }

  public get packages(): Map<string, artifacts.withId<artifacts.anyType>> {
    const pkgs = new Map<string, artifacts.withId<artifacts.anyType>>();

    for (const [_, ep] of this.entrypoints.entries()) {
      if (ep.type === 'reference') {
        // References have no pacakge definitions inside
        continue;
      }

      const key = ep.artifact.type === 'docker' ? docker.entrypointName(ep.artifact.id) : ep.artifact.id;
      pkgs.set(key, ep.artifact);
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

      if (!result.has(ep.artifact.id)) {
        result.set(ep.artifact.id, []);
      }

      result.get(ep.artifact.id)!.push(epName);
    }

    return result;
  }

  public get buildablePackages(): Map<string, artifacts.withId<artifacts.anyType>> {
    return new Map(Array.from(this.packages.entries())
      .filter(([id, _]) => !docker.isVirtualDockerEntrypointName(id)) // do not show virtual docker entrypoints
      .filter(([, value]) => artifacts.isBuildable(value.type)),
    );
  }

  public packageHasType(id: string, type: artifacts.artifactType): boolean {
    const pkg = this.packages.get(id);
    if (pkg && pkg.type === type) {
      return true;
    }

    // check 'magic' entrypoint name with suffix
    const dockerPkg = this.packages.get(docker.entrypointName(id));
    if (dockerPkg) {
      return true;
    }

    return false;
  }

  public getArtifact(id: string, type: 'docker'): artifacts.withId<artifacts.dockerType> | undefined;
  public getArtifact(id: string, type: 'archive'): artifacts.withId<artifacts.anyType> | undefined;
  public getArtifact(id: string, type: 'docker' | 'archive' | 'any'): artifacts.withId<artifacts.anyType> | undefined {
    const artifact = this.packages.get(id);

    switch (type) {
      case 'any': {
        return artifact || this.packages.get(docker.entrypointName(id));
      }
      case 'docker': {
        if (artifact?.type === 'docker') {
          return artifact;
        }
        // Virtual entrypoint with suffix specially for docker artifacts.
        return this.packages.get(docker.entrypointName(id));
      }
      case 'archive': {
        if (artifact?.type === 'docker') {
          return undefined;
        }
        return artifact;
      }
      default: {
        util.assertNever(type);
        return undefined;
      }
    }
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
          throw util.CLIError(
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
      this.renderer.writeSwJson(swJson);
    }

    for (const [epName, ep] of entrypoints) {
      if (ep.type === 'reference') {
        const srcPath = this.pkgInfo.resolveReference(epName, ep);
        this.renderer.copySwJson(epName, srcPath);
      }
    }
  }

  public async buildSoftwarePackages(options?: {
    ids?: string[];
    forceBuild?: boolean;

    archivePath?: string;
    contentRoot?: string;
    skipIfEmpty?: boolean;

    // Automated builds settings
    condaBuild?: boolean;
  }) {
    const packagesToBuild = options?.ids ?? Array.from(this.buildablePackages.keys());

    if (packagesToBuild.length > 1 && options?.archivePath && !options.forceBuild) {
      this.logger.error(
        'Attempt to build several packages targeting single package archive. This will simply overwrite the archive several times. If you know what you are doing, add \'--force\' flag',
      );
      throw util.CLIError('attempt to build several packages using the same software package archive');
    }

    for (const artifactID of packagesToBuild) {
      const artifact = this.getArtifact(artifactID, 'archive');

      if (!artifact) {
        if (options?.ids) {
          this.logger.warn(`Package '${artifactID}' is not buildable into archive. Skipped.`);
        }
        continue;
      }

      if (artifacts.isCrossPlatform(artifact.type)) {
        await this.buildSoftwarePackage(artifact, util.currentPlatform(), options);
      } else if (this.targetPlatform) {
        await this.buildSoftwarePackage(artifact, this.targetPlatform, options);
      } else if (this.allPlatforms) {
        for (const platform of this.pkgInfo.artifactPlatforms(artifact)) {
          await this.buildSoftwarePackage(artifact, platform, options);
        }
      } else {
        await this.buildSoftwarePackage(artifact, util.currentPlatform(), options);
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
  public async buildSoftwarePackage(
    artifact: artifacts.withId<artifacts.anyType>,
    platform: util.PlatformType,
    options?: {
      archivePath?: string;
      contentRoot?: string;
      skipIfEmpty?: boolean;

      // Automated builds settings
      condaBuild?: boolean;
    },
  ) {
    this.logger.info(`Building software package '${artifact.id}' for platform '${platform}'...`);
    const { os, arch } = util.splitPlatform(platform);

    if (!artifacts.archiveArtifactTypes.includes(artifact.type)) {
      if (options?.skipIfEmpty) {
        this.logger.info(`  archive build was skipped: package '${artifact.id}' is not buildable`);
      }
      this.logger.error(
        `  not buildable: artifact '${artifact.id}' archive build is impossible for configuration inside '${util.softwareConfigName}'`,
      );

      throw util.CLIError('not a buildable artifact');
    }

    const contentRoot = options?.contentRoot ?? this.pkgInfo.artifactContentRoot(artifact, platform);

    if (artifact.type === 'asset') {
      const archivePath = options?.archivePath ?? this.assetArchivePath(artifact, os, arch);
      await this.createPackageArchive('assets', artifact, archivePath, contentRoot, os, arch);
      return;
    }

    const artType = artifact.type;
    switch (artType) {
      case 'conda': {
        if (options?.condaBuild === undefined || options.condaBuild) { // build by default, skip if explicitly disabled
          await this.buildCondaPackage({ artifact, platform, contentRoot });
        } else {
          this.logger.debug(`Conda environment build was skipped.`);
        }
        break;
      }
    }

    if (this.buildMode === 'dev-local') {
      this.logger.info(
        `  no need to build software archive in '${this.buildMode}' mode: archive build was skipped`,
      );
      return;
    }

    const archivePath = options?.archivePath ?? this.binArchivePath(artifact, os, arch);
    await this.createPackageArchive('software', artifact, archivePath, contentRoot, os, arch);
  }

  public buildDockerImages(
    options?: {
      ids?: string[];
      registry?: string;
      strictPlatformMatching?: boolean; // if true, build docker images only on linux OS. Used in CI.
    },
  ) {
    const packagesToBuild = options?.ids ?? Array.from(this.buildablePackages.keys());

    for (const pkgID of packagesToBuild) {
      const artifact = this.getArtifact(pkgID, 'docker');

      if (!artifact) {
        if (options?.ids) {
          this.logger.warn(`Package '${pkgID}' is not buildable into docker image. Skipped.`);
        }
        continue;
      }

      if (!artifacts.dockerArchitectures.includes(util.currentArch())) {
        this.logger.log(options?.strictPlatformMatching ? 'debug' : 'warn',
          `Docker image generation was skipped because host architecture '${util.currentArch()}'`
          + ` is currently not supported by Platforma Backend docker feature`,
        );
        continue;
      }

      if (options?.strictPlatformMatching && util.currentOS() !== 'linux') {
        this.logger.debug(
          `Docker image generation was skipped: not a linux OS and 'strictPlatformMatching' is enabled`,
        );
        continue;
      }

      this.buildDockerImage(artifact.id, artifact, options?.registry);
    }
  }

  private buildDockerImage(pkgID: string, artifact: artifacts.withId<artifacts.dockerType>, registry?: string) {
    const dockerfile = path.resolve(this.pkgInfo.packageRoot, artifact.dockerfile ?? 'Dockerfile');
    const context = path.resolve(this.pkgInfo.packageRoot, artifact.context ?? '.');
    registry = registry ?? artifact.registry;

    if (!fs.existsSync(dockerfile)) {
      throw util.CLIError(`Dockerfile '${dockerfile}' not found`);
    }

    if (!fs.existsSync(context)) {
      throw util.CLIError(`Context '${context}' not found`);
    }

    const localTag = docker.generateLocalTagName(this.pkgInfo.packageRoot, artifact);

    this.logger.info(`Building docker image...`);
    this.logger.debug(`  dockerfile: '${dockerfile}'
  context: '${context}'
  localTag: '${localTag}'
    `);

    const name = this.pkgInfo.artifactName(artifact);

    docker.build(context, dockerfile, localTag, name, this.pkgInfo.version);

    const imageHash = docker.getImageHash(localTag);
    const dstTag = docker.generateRemoteTagName(name, imageHash, registry);

    this.logger.debug(`Adding destination tag to docker image:
      dstTag: "${dstTag}"
    `);
    docker.addTag(localTag, dstTag);
    // do not remove local tag to make 'local' builds to also work with docker.

    const artInfoPath = this.pkgInfo.artifactInfoLocation(pkgID, 'docker', util.currentArch());
    writeBuiltArtifactInfo(artInfoPath, {
      type: 'docker',
      platform: util.currentPlatform(),
      remoteArtifactLocation: dstTag,
    });

    this.logger.info(`Docker image is built:
  tag: '${dstTag}'
  location file: '${artInfoPath}'`);

    this.logger.debug(`Clearing context directory from temporary files...`);
    if (fs.existsSync(path.join(context, tmpSpecFile))) {
      fs.unlinkSync(path.join(context, tmpSpecFile));
    }
  }

  private async buildCondaPackage(opts: {
    artifact: artifacts.withId<artifacts.condaType>;
    platform: util.PlatformType;
    contentRoot: string;
  }) {
    const { artifact, platform, contentRoot } = opts;

    if (platform !== util.currentPlatform()) {
      this.logger.warn(
        `Conda package cannot be built cross-platform:\n`
        + `  current platform is '${util.currentPlatform()}', requested platform is '${platform}'\n`
        + `Conda environment automatic build was skipped`,
      );
      return;
    }

    this.logger.info(`Building conda environment for current platform...`);

    const srcSpecPath = path.resolve(this.pkgInfo.packageRoot, artifact.spec);
    if (!fs.existsSync(srcSpecPath)) {
      this.logger.error(`Conda environment specification file '${artifact.spec}' not found at '${srcSpecPath}'`);
      throw util.CLIError(`Cannot build conda environment '${artifact.id}': no specification file.`);
    }

    const micromambaRoot = path.join(contentRoot, defaults.CONDA_DATA_LOCATION);
    const micromambaBin = path.join(contentRoot, 'micromamba');

    this.logger.debug(`Creating micromamba root directory: '${micromambaRoot}'`);
    await fsp.mkdir(micromambaRoot, { recursive: true });

    this.logger.debug(`Creating micromamba instance...`);
    const m = new micromamba(this.logger, micromambaRoot, artifact['micromamba-version'], micromambaBin);

    const resultSpecPath = path.join(contentRoot, defaults.CONDA_FROEZEN_ENV_SPEC_FILE);

    await m.downloadBinary();
    m.createEnvironment({ specFile: srcSpecPath });
    m.exportEnvironment({ outputFile: resultSpecPath });
    m.deleteEnvironment({});

    this.logger.debug(`Conda environment was built at '${micromambaRoot}'.`);

    this.logger.debug(`Cutting prefix from conda environment file...`);

    const resultSpec = yaml.parse(await fsp.readFile(resultSpecPath, 'utf-8')) as Record<string, unknown>;
    resultSpec.prefix = undefined; // cut original env location (with path from CI) from the resulting spec file

    // Fixup the structure: for empty lists export produces YAML that cannot be then read back on server side for restoration.
    if (!resultSpec.channels) {
      resultSpec.channels = [];
    }
    if (!resultSpec.dependencies) {
      resultSpec.dependencies = [];
    }
    await fsp.writeFile(resultSpecPath, yaml.stringify(resultSpec));

    this.logger.debug(`Conda environment file is ready: '${resultSpecPath}'`);
  }

  private async createPackageArchive(
    packageContentType: string,
    artifact: artifacts.withId<artifacts.anyType>,
    archivePath: string,
    contentRoot: string,
    os: util.OSType,
    arch: util.ArchType,
  ) {
    this.logger.debug(`  packing ${packageContentType} into a package`);
    if (artifacts.isCrossPlatform(artifact.type)) {
      this.logger.debug(`    generating cross-platform package`);
    } else {
      this.logger.debug(`    generating package for os='${os}', arch='${arch}'`);
    }
    this.logger.debug(`    package content root: '${contentRoot}'`);
    this.logger.debug(`    package destination archive: '${archivePath}'`);

    await archive.create(this.logger, contentRoot, archivePath);

    const artInfoPath = this.pkgInfo.artifactInfoLocation(
      artifact.id,
      'archive',
      artifacts.isCrossPlatform(artifact.type) ? undefined : util.joinPlatform(os, arch),
    );

    const registry = this.pkgInfo.artifactRegistrySettings(artifact);

    writeBuiltArtifactInfo(artInfoPath, {
      type: artifact.type,
      platform: util.joinPlatform(os, arch),
      registryURL: registry.downloadURL,
      registryName: registry.name,
      remoteArtifactLocation: this.pkgInfo.artifactArchiveAddressPattern(artifact),
      uploadPath: this.pkgInfo.artifactArchiveFullName(artifact, util.joinPlatform(os, arch)),
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
      const pkg = this.getArtifact(pkgID, 'archive');

      if (!pkg) {
        if (options?.ids) {
          this.logger.warn(`Package '${pkgID}' is not buildable into archive. Cannot publish archive artifact.`);
        }
        continue;
      }

      if (artifacts.isCrossPlatform(pkg.type)) {
        uploads.push(this.publishPackage(pkg, util.currentPlatform(), options));
      } else if (this.targetPlatform) {
        uploads.push(this.publishPackage(pkg, this.targetPlatform, options));
      } else if (this.allPlatforms) {
        for (const platform of this.pkgInfo.artifactPlatforms(pkg)) {
          uploads.push(this.publishPackage(pkg, platform, options));
        }
      } else {
        uploads.push(this.publishPackage(pkg, util.currentPlatform(), options));
      }
    }

    return Promise.all(uploads);
  }

  private async publishPackage(
    artifact: artifacts.withId<artifacts.anyType>,
    platform: util.PlatformType,
    options?: {
      archivePath?: string;
      storageURL?: string;

      failExisting?: boolean;
      forceReupload?: boolean;
    },
  ) {
    if (artifact.type === 'docker') {
      this.publishDockerImage(artifact);
      return;
    }

    await this.publishArchive(artifact, platform, options);
  }

  private async publishArchive(artifact: artifacts.withId<artifacts.anyType>, platform: util.PlatformType, options?: {
    archivePath?: string;
    storageURL?: string;
    failExisting?: boolean;
    forceReupload?: boolean;
  }) {
    const { os, arch } = util.splitPlatform(platform);

    const artifactName = this.pkgInfo.artifactName(artifact);
    const registry = this.pkgInfo.artifactRegistrySettings(artifact);
    const storageURL = options?.storageURL ?? registry.storageURL;

    const archivePath = options?.archivePath ?? this.archivePath(artifact, os, arch);

    const artInfoPath = this.pkgInfo.artifactInfoLocation(artifact.id, 'archive', artifacts.isCrossPlatform(artifact.type) ? undefined : util.joinPlatform(os, arch));
    const artInfo = readBuiltArtifactInfo(artInfoPath);
    const dstName = artInfo.uploadPath ?? artInfo.remoteArtifactLocation;

    if (!storageURL) {
      const regNameUpper = registry.name.toUpperCase().replaceAll(/[^A-Z0-9_]/g, '_');
      this.logger.error(`no storage URL is set for registry ${registry.name}`);
      throw util.CLIError(
        `'registry.storageURL' of package '${artifact.id}' is empty. Set it as command option, in '${util.softwareConfigName}' file or via environment variable 'PL_REGISTRY_${regNameUpper}_UPLOAD_URL'`,
      );
    }

    this.logger.info(
      `Publishing package '${artifactName}' for platform '${platform}' into registry '${registry.name}'`,
    );
    this.logger.debug(`  registry storage URL: '${storageURL}'`);
    this.logger.debug(`  archive to publish: '${archivePath}'`);
    this.logger.debug(`  target package name: '${dstName}'`);

    const s = await storage.initByUrl(storageURL, this.pkgInfo.packageRoot);

    const exists = await s.exists(dstName);
    if (exists && !options?.forceReupload) {
      if (options?.failExisting) {
        throw util.CLIError(
          `software package '${dstName}' already exists in registry '${registry.name}'. To re-upload it, use 'force' flag. To not fail, remove 'fail-existing-packages' flag`,
        );
      }

      this.logger.warn(
        `software package '${dstName}' already exists in registry '${registry.name}'. Upload was skipped.`,
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

    return Promise.all(uploads).then(() => {
      this.logger.info(`Package '${artifactName}' was published to '${registry.name}:${dstName}'`);
      return;
    });
  }

  public publishDockerImages(options?: {
    ids?: string[];
    pushTo?: string;
    strictPlatformMatching?: boolean; // if true, build docker images only on linux OS. Used in CI.
  }) {
    const packagesToPublish = options?.ids ?? Array.from(this.buildablePackages.keys());

    for (const pkgID of packagesToPublish) {
      const pkg = this.getArtifact(pkgID, 'docker');
      if (!pkg) {
        if (options?.ids) {
          this.logger.warn(`Package '${pkgID}' is not buildable into docker image. Cannot publish docker image.`);
        }
        continue;
      }

      if (!artifacts.dockerArchitectures.includes(util.currentArch())) {
        this.logger.log(options?.strictPlatformMatching ? 'debug' : 'warn',
          `Docker image generation was skipped because host architecture '${util.currentArch()}'`
          + ` is currently not supported by Platforma Backend docker feature`,
        );
        continue;
      }

      if (options?.strictPlatformMatching && util.currentOS() !== 'linux') {
        this.logger.debug(
          `Docker image generation was skipped: not a linux OS and 'strictPlatformMatching' is enabled`,
        );
        continue;
      }

      this.publishDockerImage(pkg, options?.pushTo);
    }
  }

  private publishDockerImage(artifact: artifacts.withId<artifacts.anyType>, pushTo?: string) {
    if (artifact.type !== 'docker') {
      throw util.CLIError(`package '${artifact.id}' is not a docker package`);
    }

    const artInfoPath = this.pkgInfo.artifactInfoLocation(artifact.id, 'docker', util.currentArch());
    const artInfo = readBuiltArtifactInfo(artInfoPath);
    const tag = artInfo.remoteArtifactLocation;
    const pushTag = pushTo ? `${pushTo}:${tag.split(':').slice(-1)[0]}` : tag;

    // Because of turbo caching, we may face situation when no real docker build was executed on CI agent,
    // but image is already in remote registry. We should not fail in such scenarios, calmly skipping docker push step.
    const remoteImageExists = docker.remoteImageExists(pushTag);
    if (remoteImageExists) {
      this.logger.info(`Docker image '${tag}' not exists locally but is already in remote registry. Skipping push...`);
      return;
    }

    const localImageExists = docker.localImageExists(tag);
    if (!localImageExists) {
      throw util.CLIError(`Docker image '${tag}' not exists locally and is not found in remote registry. Publication failed.`);
    }

    if (pushTo) {
      docker.addTag(tag, pushTag);
      this.logger.info(`Publishing docker image '${tag}' using alternative tag '${pushTag}'`);
    } else {
      this.logger.info(`Publishing docker image '${tag}' with tag '${pushTag}'`);
    }

    docker.push(pushTag);
  }

  private get renderer(): SwJsonRenderer {
    if (!this._renderer) {
      this._renderer = new SwJsonRenderer(this.logger, this.pkgInfo);
    }

    return this._renderer;
  }

  private archiveOptions(
    pkg: artifacts.anyType,
    name: string,
    version: string,
    os: util.OSType,
    arch: util.ArchType,
    archiveType: archive.archiveType,
  ): archive.archiveOptions {
    return {
      packageRoot: this.pkgInfo.packageRoot,
      packageName: name,
      packageVersion: version,

      crossplatform: artifacts.isCrossPlatform(pkg.type),
      os: os,
      arch: arch,
      ext: archiveType,
    };
  }
}
