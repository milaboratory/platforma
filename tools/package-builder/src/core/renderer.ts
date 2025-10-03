import path from 'node:path';
import fs from 'node:fs';
import type winston from 'winston';
import type { PackageInfo } from './package-info';
import type * as artifacts from './schemas/artifacts';
import type * as swJson from './schemas/sw-json';
import type { Entrypoint, EntrypointType, PackageEntrypoint } from './schemas/entrypoint';
import * as util from './util';
import * as docker from './docker';
import { descriptorFilePath } from './resolver';
import { resolveRunEnvironment } from './resolver';

export class Renderer {
  constructor(
    private logger: winston.Logger,
    private readonly pkgInfo: PackageInfo,
  ) {}

  public renderSoftwareEntrypoints(
    mode: util.BuildMode,
    entrypoints: Map<string, Entrypoint>,
    options?: {
      requireAllArtifacts?: boolean;
      fullDirHash?: boolean;
    },
  ): Map<string, swJson.entrypoint> {
    const result = new Map<string, swJson.entrypoint>();
    let hasReferences = false;

    const fullDirHash = options?.fullDirHash ?? false;

    this.logger.info(`Rendering entrypoint descriptors...`);
    this.logger.debug('  entrypoints: ' + JSON.stringify(entrypoints));

    for (const [epName, ep] of entrypoints.entries()) {
      if (ep.type === 'reference') {
        // Entrypoint references do not need any rendering
        hasReferences = true;
        continue;
      }

      this.logger.debug(`Rendering entrypoint descriptor '${epName}'...`);

      //
      // In docker case we should merge docker info and other info
      //
      const originEpName = docker.entrypointNameToOrigin(epName);
      const info = result.has(originEpName)
        ? result.get(originEpName)
        : {
            id: {
              package: this.pkgInfo.packageName,
              name: originEpName,
            },
          };
      if (!info) {
        throw util.CLIError(`Entrypoint ${epName} not found in result`);
      }

      if (mode !== 'release') {
        info.isDev = true;
      }

      const pkg = ep.package;
      if (mode === 'dev-local') {
        switch (pkg.type) {
          case 'docker':
            info.docker = this.renderDockerInfo(epName, ep, options?.requireAllArtifacts);
            validateDockerDescriptor(info.docker);
            break;
          default:
            this.logger.debug('  rendering \'local\' source...');
            info.local = this.renderLocalInfo(epName, ep, fullDirHash);
        }

        result.set(originEpName, info);
        continue;
      }

      const type = pkg.type;
      switch (type) {
        case 'R':
          info.binary = this.renderBinaryInfo(mode, epName, ep, options?.requireAllArtifacts);
          break;
        case 'environment':
          info.runEnv = this.renderRunEnvInfo(mode, epName, ep, options?.requireAllArtifacts);
          break;
        case 'asset':
          info.asset = this.renderAssetInfo(mode, epName, ep, options?.requireAllArtifacts);
          break;
        case 'binary':
          info.binary = this.renderBinaryInfo(mode, epName, ep, options?.requireAllArtifacts);
          break;
        case 'docker':
          info.docker = this.renderDockerInfo(epName, ep, options?.requireAllArtifacts);
          break;
        case 'java':
          info.binary = this.renderBinaryInfo(mode, epName, ep, options?.requireAllArtifacts);
          break;
        case 'python':
          info.binary = this.renderBinaryInfo(mode, epName, ep, options?.requireAllArtifacts);
          break;
        default:
          util.assertNever(type);
          throw new Error(`renderer logic error: renderSoftwareEntrypoints does not cover all package types`);
      }

      result.set(originEpName, info);
    }

    if (result.size === 0 && !hasReferences) {
      this.logger.error('no entrypoint descriptors were rendered');
      throw util.CLIError('no entrypoint descriptors were rendered');
    }

    return result;
  }

  public writeEntrypointDescriptor(info: swJson.entrypoint, dstFile?: string) {
    const epType = info.asset ? 'asset' : 'software';
    const dstSwInfoPath = dstFile ?? descriptorFilePath(this.pkgInfo.packageRoot, epType, info.id.name);

    this.logger.info(`Writing entrypoint descriptor to '${dstSwInfoPath}'`);

    const { id, ...toEncode } = info; // cut 'artifact' from final .sw.json
    const encoded = JSON.stringify({
      name: util.artifactIDToString(id),
      ...toEncode,
    });

    util.ensureDirsExist(path.dirname(dstSwInfoPath));
    fs.writeFileSync(dstSwInfoPath, encoded + '\n');
  }

  public copyEntrypointDescriptor(epName: string, srcFile: string) {
    let epType: Extract<EntrypointType, 'software' | 'asset'>;
    if (srcFile.endsWith(compiledSoftwareSuffix)) {
      epType = 'software';
    } else if (srcFile.endsWith(compiledAssetSuffix)) {
      epType = 'asset';
    } else {
      throw util.CLIError(
        `unknown entrypoint '${epName}' type: cannot get type from extension of source file ${srcFile}`,
      );
    }

    const dstSwInfoPath = descriptorFilePath(this.pkgInfo.packageRoot, epType, epName);
    util.ensureDirsExist(path.dirname(dstSwInfoPath));
    fs.copyFileSync(srcFile, dstSwInfoPath);
  }

  private renderLocalInfo(
    epName: string,
    ep: PackageEntrypoint,
    fullDirHash: boolean,
  ): swJson.localInfo {
    const pkg = ep.package;
    const rootDir = pkg.contentRoot(util.currentPlatform());
    const hash = fullDirHash ? util.hashDirSync(rootDir) : util.hashDirMetaSync(rootDir);

    const epType = ep.type;
    switch (epType) {
      case 'environment':
        throw util.CLIError(
          `entrypoint ${epName} points to 'environment' artifact, which does not support local build yet`,
        );

      case 'asset':
        throw util.CLIError(
          `entrypoint ${epName} points to 'asset' artifact, which does not support local build yet`,
        );

      case 'software':{
        const pkgType = pkg.type;
        switch (pkgType) {
          case 'environment':{
            throw util.CLIError(
              `entrypoint is incompatible with artifact type: ep=${epName} (software), artifact='${pkgType}'`,
            );
          }
          case 'asset':{
            throw util.CLIError(
              `entrypoint is incompatible with artifact type: ep=${epName} (software), artifact='${pkgType}'`,
            );
          }
          case 'binary':{
            // Regular binary with no run environment dependency
            return {
              type: 'binary',
              hash: hash.digest().toString('hex'),
              path: rootDir,
              cmd: ep.cmd,
              envVars: ep.env,
            };
          }
          case 'java':{
            return {
              type: 'java',
              hash: hash.digest().toString('hex'),
              path: rootDir,
              cmd: ep.cmd,
              envVars: ep.env,
              runEnv: resolveRunEnvironment(this.logger, this.pkgInfo.packageRoot, this.pkgInfo.packageName, pkg.environment, pkg.type),
            };
          }
          case 'python': {
            const { toolset, ...deps } = pkg.dependencies ?? {};

            return {
              type: 'python',
              hash: hash.digest().toString('hex'),
              path: rootDir,
              cmd: ep.cmd,
              envVars: ep.env,
              runEnv: resolveRunEnvironment(this.logger, this.pkgInfo.packageRoot, this.pkgInfo.packageName, pkg.environment, pkg.type),
              toolset: toolset ?? 'pip',
              dependencies: deps,
            };
          }
          case 'R': {
            return {
              type: 'R',
              hash: hash.digest().toString('hex'),
              path: rootDir,
              cmd: ep.cmd,
              envVars: ep.env,
              toolset: 'renv',
              dependencies: {},
              runEnv: resolveRunEnvironment(this.logger, this.pkgInfo.packageRoot, this.pkgInfo.packageName, pkg.environment, pkg.type),
            };
          }
          case 'docker': {
            throw util.CLIError(
              `entrypoint is incompatible for local build with artifact type: ep=${epName} (software), artifact='${pkgType}'`,
            );
          }
          // case "conda":
          //     if (runEnv!.type !== pkgType) {
          //         this.logger.error(`run environment '${binary.environment}' type '${runEnv!.type}' differs from declared package type '${binary.type}'`)
          //         throw new Error(`incompatible environment: env type '${runEnv!.type}' != package type '${binary.type}'`)
          //     }
          //     return {
          //         type: "conda",
          //         hash: hash.digest().toString('hex'),
          //         path: rootDir,
          //         cmd: ep.cmd,
          //         envVars: ep.envVars,
          //         runEnv: runEnv!,
          //     }
          default:
            util.assertNever(pkgType);
            throw new Error(
              'renderer logic error: renderLocalInfo does not cover all artifact types',
            );
        }
      }

      default:
        util.assertNever(epType);
        throw new Error(
          'renderer logic error: renderLocalInfo does not cover all environment types',
        );
    }
  }

  private renderBinaryInfo(
    mode: util.BuildMode,
    epName: string,
    ep: PackageEntrypoint,
    requireArtifactInfo?: boolean,
  ): swJson.binaryInfo | undefined {
    switch (mode) {
      case 'release':
        break;

      case 'dev-local':
        throw new Error(`'*.sw.json' generator logic error`);

      default:
        util.assertNever(mode);
    }

    const binPkg = ep.package;

    // TODO: we need to collect artifact info for all platforms
    const artInfoPath = this.pkgInfo.artifactInfoLocation(
      binPkg.id, 'archive',
      binPkg.crossplatform ? undefined : util.currentPlatform(),
    );
    const artInfo = readArtifactInfoIfExists(artInfoPath, epName, requireArtifactInfo);
    if (!artInfo) {
      return undefined;
    }

    if (!artInfo.registryName) {
      throw util.CLIError(
        `could not render binary entrypoint '${epName}': registry name is not set in artifact info file ${artInfoPath}`,
      );
    }

    const epType = ep.type;
    switch (epType) {
      case 'environment':{
        throw new Error(
          `internal build script logic error: attempt to build 'environment' entrypoint ${epName} as binary`,
        );
      }
      case 'asset':{
        throw new Error(
          `internal build script logic error: attempt to build 'asset' entrypoint ${epName} as binary`,
        );
      }
      case 'software':{
        const pkgType = binPkg.type;
        switch (pkgType) {
          case 'asset':{
            throw util.CLIError(
              `entripoint is incompatible with artifact type: ep=${epName} (software), artifact='${pkgType}'`,
            );
          }
          case 'environment':{
            throw util.CLIError(
              `entripoint is incompatible with artifact type: ep=${epName} (software), artifact='${pkgType}'`,
            );
          }
          case 'docker': {
            throw util.CLIError(
              `entrypoint is incompatible with artifact type: ep=${epName} (software), artifact='${pkgType}'`,
            );
          }
          case 'binary':{
            // Regular binary with no run environment dependency
            return {
              type: 'binary',
              registry: artInfo.registryName,
              package: artInfo.remoteArtifactLocation,

              cmd: ep.cmd,
              envVars: ep.env,
            };
          }
          case 'java':{
            return {
              type: 'java',
              registry: artInfo.registryName,
              package: artInfo.remoteArtifactLocation,

              cmd: ep.cmd,
              envVars: ep.env,
              runEnv: resolveRunEnvironment(this.logger, this.pkgInfo.packageRoot, this.pkgInfo.packageName, binPkg.environment, binPkg.type),
            };
          }
          case 'python': {
            const { toolset, ...deps } = binPkg.dependencies ?? {};

            return {
              type: 'python',
              registry: artInfo.registryName,
              package: artInfo.remoteArtifactLocation,

              cmd: ep.cmd,
              envVars: ep.env,
              runEnv: resolveRunEnvironment(this.logger, this.pkgInfo.packageRoot, this.pkgInfo.packageName, binPkg.environment, binPkg.type),
              toolset: toolset ?? 'pip',
              dependencies: deps,
            };
          }
          case 'R': {
            return {
              type: 'R',
              registry: artInfo.registryName,
              package: artInfo.remoteArtifactLocation,

              cmd: ep.cmd,
              envVars: ep.env,
              runEnv: resolveRunEnvironment(this.logger, this.pkgInfo.packageRoot, this.pkgInfo.packageName, binPkg.environment, binPkg.type),
              toolset: 'renv',
              dependencies: {},
            };
          }
          // case "conda":{
          //     return {
          //         type: "conda",
          //         registry: artifactInfo.registryName,
          //         package: artifactInfo.pathForSwJson,

          //         cmd: ep.cmd,
          //         envVars: ep.envVars,
          //         runEnv: runEnv!,
          //     }
          //   }
          default:{
            util.assertNever(pkgType);
            throw new Error(
              'renderer logic error: renderBinaryInfo does not cover all package types',
            );
          }
        }
      }
      default:{
        util.assertNever(epType);
        throw new Error(
          'renderer logic error: renderLocalInfo does not cover all environment types',
        );
      }
    }
  }

  private renderRunEnvInfo(
    mode: util.BuildMode,
    epName: string,
    ep: PackageEntrypoint,
    requireArtifactInfo?: boolean,
  ): swJson.runEnvInfo | undefined {
    switch (mode) {
      case 'release':
        break;

      case 'dev-local':
        throw util.CLIError(`run environments do not support 'local' dev build mode yet`);

      default:
        util.assertNever(mode);
    }

    const envPkg = ep.package;

    if (envPkg.type !== 'environment') {
      throw util.CLIError(
        `could not render run environemnt entrypoint ${epName} (not 'environment' artifact)`,
      );
    }

    // TODO: we need to collect artifact info for all platforms
    const artInfoPath = this.pkgInfo.artifactInfoLocation(envPkg.id, 'archive', util.currentPlatform());
    const artInfo = readArtifactInfoIfExists(artInfoPath, epName, requireArtifactInfo);
    if (!artInfo) {
      return undefined;
    }

    return {
      type: envPkg.runtime,

      ['r-version']: envPkg['r-version'],
      ['python-version']: envPkg['python-version'],
      ['java-version']: envPkg['java-version'],

      envVars: envPkg.envVars ?? [],
      registry: artInfo.registryName!,
      package: artInfo.remoteArtifactLocation,
      binDir: envPkg.binDir,
    };
  }

  private renderAssetInfo(mode: util.BuildMode, epName: string, ep: PackageEntrypoint, requireArtifactInfo?: boolean): swJson.assetInfo | undefined {
    switch (mode) {
      case 'release':
        break;

      case 'dev-local':
        throw util.CLIError(`assets do not support 'local' dev build mode yet`);

      default:
        util.assertNever(mode);
    }

    const assetPkg = ep.package;

    if (assetPkg.type !== 'asset') {
      throw util.CLIError(`could not render asset entrypoint '${epName}': not 'asset' artifact`);
    }

    const artInfoPath = this.pkgInfo.artifactInfoLocation(assetPkg.id, 'archive', undefined);
    const artInfo = readArtifactInfoIfExists(artInfoPath, epName, requireArtifactInfo);
    if (!artInfo) {
      return undefined;
    }

    if (!artInfo.registryURL) {
      throw util.CLIError(
        `could not render asset entrypoint '${epName}': base download URL is not configured for asset's registry`,
      );
    }

    return {
      registry: artInfo.registryName!,
      package: artInfo.remoteArtifactLocation,
      url: util.urlJoin(artInfo.registryURL, artInfo.remoteArtifactLocation),
    };
  }

  private renderDockerInfo(epName: string, ep: PackageEntrypoint, requireArtifactInfo?: boolean): swJson.dockerInfo | undefined {
    const dockerPkg = ep.package;
    if (dockerPkg.type !== 'docker') {
      throw util.CLIError(`could not render docker entrypoint '${epName}': not 'docker' artifact`);
    }

    if (ep.type !== 'software') {
      throw util.CLIError(`could not render docker entrypoint '${epName}': not 'software' artifact`);
    }

    const artInfoPath = this.pkgInfo.artifactInfoLocation(dockerPkg.id, 'docker', util.currentArch());
    const artInfo = readArtifactInfoIfExists(artInfoPath, epName, requireArtifactInfo);
    if (!artInfo) {
      return undefined;
    }

    return {
      tag: artInfo.remoteArtifactLocation,
      entrypoint: dockerPkg.entrypoint ?? [],
      cmd: ep.cmd,
      pkg: dockerPkg.pkg,
    };
  }
}

export const compiledSoftwareSuffix = '.sw.json';
export const compiledAssetSuffix = '.as.json';

export type builtArtifactInfo = {
  type: artifacts.artifactType;
  platform: util.PlatformType;
  registryURL?: string; // registry public URL (for assets)
  registryName?: string; // name of registry (for binary and asset archives)
  remoteArtifactLocation: string; // path to put into sw.json or as.json file
  uploadPath?: string; // custom upload path if it does not match pathForSwJson
};

export function writeBuiltArtifactInfo(
  location: string,
  locInfo: builtArtifactInfo) {
  fs.mkdirSync(path.dirname(location), { recursive: true });
  fs.writeFileSync(location, JSON.stringify(locInfo), { encoding: 'utf8' });
}

export function readBuiltArtifactInfo(
  location: string,
): builtArtifactInfo {
  const data = fs.readFileSync(location, 'utf8');
  return JSON.parse(data) as builtArtifactInfo;
}

function readArtifactInfoIfExists(location: string, epName: string, requireExisting?: boolean): builtArtifactInfo | undefined {
  if (fs.existsSync(location)) {
    return readBuiltArtifactInfo(location);
  }

  if (requireExisting) {
    throw util.CLIError(`could not render docker entrypoint '${epName}': artifact info file '${location}' does not exist`);
  }

  return undefined;
}

export function validateDockerDescriptor(dockerDescriptor: swJson.dockerInfo | undefined): void {
  if (!dockerDescriptor?.cmd?.length) {
    return;
  }

  const isPkgRequired = dockerDescriptor.cmd.some((cmd) => cmd.includes('{pkg}'));
  if (isPkgRequired && !dockerDescriptor.pkg) {
    throw util.CLIError(`docker descriptor is invalid: 'pkg' is required when 'cmd' contains '{pkg}'`);
  }
}
