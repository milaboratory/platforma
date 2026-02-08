import path from "node:path";
import fs from "node:fs";
import type winston from "winston";
import type { PackageInfo } from "./package-info";
import * as artifacts from "./schemas/artifacts";
import type * as swJson from "./schemas/sw-json";
import type * as entrypoint from "./schemas/entrypoints";
import * as util from "./util";
import * as docker from "./docker";
import * as defaults from "../defaults";
import { descriptorFilePath } from "./resolver";
import { resolveRunEnvironment } from "./resolver";

export class SwJsonRenderer {
  constructor(
    private logger: winston.Logger,
    private readonly pkgInfo: PackageInfo,
  ) {}

  public renderSoftwareEntrypoints(
    mode: util.BuildMode,
    entrypoints: Map<string, entrypoint.Entrypoint>,
    options?: {
      requireAllArtifacts?: boolean;
      fullDirHash?: boolean;
    },
  ): Map<string, swJson.swJsonType> {
    const result = new Map<string, swJson.swJsonType>();
    let hasReferences = false;

    const fullDirHash = options?.fullDirHash ?? false;

    this.logger.info(`Rendering entrypoint descriptors...`);
    this.logger.debug("  entrypoints: " + JSON.stringify(entrypoints));

    for (const [epName, ep] of entrypoints.entries()) {
      if (ep.type === "reference") {
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

      if (mode !== "release") {
        info.isDev = true;
      }

      const pkg = ep.artifact;
      if (mode === "dev-local") {
        switch (pkg.type) {
          case "docker": {
            info.docker = this.renderDockerInfo(epName, ep, options?.requireAllArtifacts);
            break;
          }
          default:
            this.logger.debug("  rendering 'local' source...");
            info.local = this.renderLocalPackage(epName, ep, fullDirHash);
        }

        result.set(originEpName, info);
        continue;
      }

      const type = pkg.type;
      switch (type) {
        case "R":
          info.binary = this.renderBinaryInfo(mode, epName, ep, options?.requireAllArtifacts);
          break;
        case "environment":
          info.runEnv = this.renderRunEnvInfo(mode, epName, ep, options?.requireAllArtifacts);
          break;
        case "asset":
          info.asset = this.renderAssetInfo(mode, epName, ep, options?.requireAllArtifacts);
          break;
        case "binary":
          info.binary = this.renderBinaryInfo(mode, epName, ep, options?.requireAllArtifacts);
          break;
        case "docker":
          info.docker = this.renderDockerInfo(epName, ep, options?.requireAllArtifacts);
          break;
        case "java":
          info.binary = this.renderBinaryInfo(mode, epName, ep, options?.requireAllArtifacts);
          break;
        case "python":
          info.binary = this.renderBinaryInfo(mode, epName, ep, options?.requireAllArtifacts);
          break;
        case "conda":
          info.binary = this.renderBinaryInfo(mode, epName, ep, options?.requireAllArtifacts);
          break;
        default:
          util.assertNever(type);
          throw new Error(
            `renderer logic error: renderSoftwareEntrypoints does not cover all package types`,
          );
      }

      result.set(originEpName, info);
    }

    if (result.size === 0 && !hasReferences) {
      this.logger.error("no entrypoint descriptors were rendered");
      throw util.CLIError("no entrypoint descriptors were rendered");
    }

    return result;
  }

  public writeSwJson(info: swJson.swJsonType, dstFile?: string) {
    const epType = info.asset ? "asset" : "software";
    const dstSwInfoPath =
      dstFile ?? descriptorFilePath(this.pkgInfo.packageRoot, epType, info.id.name);

    this.logger.info(`Writing entrypoint descriptor to '${dstSwInfoPath}'`);

    const { id, ...toEncode } = info; // cut entrypoint ID from the final .sw.json
    const encoded = JSON.stringify({
      name: util.artifactIDToString(id),
      ...toEncode,
    });

    util.ensureDirsExist(path.dirname(dstSwInfoPath));
    fs.writeFileSync(dstSwInfoPath, encoded + "\n");
  }

  public copySwJson(epName: string, srcFile: string) {
    let epType: Extract<entrypoint.EntrypointType, "software" | "asset">;
    if (srcFile.endsWith(compiledSoftwareSuffix)) {
      epType = "software";
    } else if (srcFile.endsWith(compiledAssetSuffix)) {
      epType = "asset";
    } else {
      throw util.CLIError(
        `unknown entrypoint '${epName}' type: cannot get type from extension of source file ${srcFile}`,
      );
    }

    const dstSwInfoPath = descriptorFilePath(this.pkgInfo.packageRoot, epType, epName);
    util.ensureDirsExist(path.dirname(dstSwInfoPath));
    fs.copyFileSync(srcFile, dstSwInfoPath);
  }

  private renderLocalPackage(
    epName: string,
    ep: entrypoint.PackageEntrypoint,
    fullDirHash: boolean,
  ): swJson.localSoftwareType {
    const artifact = ep.artifact;
    const rootDir = this.pkgInfo.artifactContentRoot(artifact, util.currentPlatform());
    const hash = fullDirHash ? util.hashDirSync(rootDir) : util.hashDirMetaSync(rootDir);

    const epType = ep.type;
    switch (epType) {
      case "environment":
        throw util.CLIError(
          `entrypoint ${epName} points to 'environment' artifact, which does not support local build yet`,
        );

      case "asset":
        throw util.CLIError(
          `entrypoint ${epName} points to 'asset' artifact, which does not support local build yet`,
        );

      case "software": {
        const pkgType = artifact.type;
        switch (pkgType) {
          case "environment": {
            throw util.CLIError(
              `entrypoint is incompatible with artifact type: ep=${epName} (software), artifact='${pkgType}'`,
            );
          }
          case "asset": {
            throw util.CLIError(
              `entrypoint is incompatible with artifact type: ep=${epName} (software), artifact='${pkgType}'`,
            );
          }
          case "binary": {
            // Regular binary with no run environment dependency
            return {
              type: "binary",
              hash: hash.digest().toString("hex"),
              path: rootDir,
              cmd: ep.cmd,
              envVars: ep.env,
            };
          }
          case "java": {
            return {
              type: "java",
              hash: hash.digest().toString("hex"),
              path: rootDir,
              cmd: ep.cmd,
              envVars: ep.env,
              runEnv: resolveRunEnvironment(
                this.logger,
                this.pkgInfo.packageRoot,
                this.pkgInfo.packageName,
                artifact.environment,
                artifact.type,
              ),
            };
          }
          case "python": {
            const { toolset, ...deps } = artifact.dependencies ?? {};

            return {
              type: "python",
              hash: hash.digest().toString("hex"),
              path: rootDir,
              cmd: ep.cmd,
              envVars: ep.env,
              runEnv: resolveRunEnvironment(
                this.logger,
                this.pkgInfo.packageRoot,
                this.pkgInfo.packageName,
                artifact.environment,
                artifact.type,
              ),
              toolset: toolset ?? defaults.PYTHON_TOOLSET,
              dependencies: deps,
            };
          }
          case "R": {
            return {
              type: "R",
              hash: hash.digest().toString("hex"),
              path: rootDir,
              cmd: ep.cmd,
              envVars: ep.env,
              toolset: "renv",
              dependencies: {},
              runEnv: resolveRunEnvironment(
                this.logger,
                this.pkgInfo.packageRoot,
                this.pkgInfo.packageName,
                artifact.environment,
                artifact.type,
              ),
            };
          }
          case "docker": {
            throw new Error(
              `internal build script logic error: attempt to build docker entrypoint as local binary package`,
            );
          }
          case "conda": {
            return {
              type: "conda",
              hash: hash.digest().toString("hex"),
              path: rootDir,
              cmd: ep.cmd,
              envVars: ep.env,

              ["micromamba-version"]: artifact["micromamba-version"],
              ["conda-root-dir"]: artifact["conda-root-dir"],
              spec: artifact.spec,
            };
          }
          default:
            util.assertNever(pkgType);
            throw new Error(
              "renderer logic error: renderLocalInfo does not cover all artifact types",
            );
        }
      }

      default:
        util.assertNever(epType);
        throw new Error(
          "renderer logic error: renderLocalInfo does not cover all environment types",
        );
    }
  }

  private renderBinaryInfo(
    mode: util.BuildMode,
    epName: string,
    ep: entrypoint.PackageEntrypoint,
    requireArtifactInfo?: boolean,
  ): swJson.remoteSoftwareType | undefined {
    switch (mode) {
      case "release":
        break;

      case "dev-local":
        throw new Error(`'*.sw.json' generator logic error`);

      default:
        util.assertNever(mode);
    }

    ep = requireEntrypointType(ep, "software", `internal build script logic error`);

    const binPkg = ep.artifact;

    // TODO: we need to collect artifact info for all platforms
    const artInfoPath = this.pkgInfo.artifactInfoLocation(
      binPkg.id,
      "archive",
      artifacts.isCrossPlatform(binPkg.type) ? undefined : util.currentPlatform(),
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

    const pkgType = binPkg.type;
    switch (pkgType) {
      case "docker": {
        throw new Error(
          `internal build script logic error: entrypoint is incompatible with artifact type: ep=${epName} (software), artifact='${pkgType}'`,
        );
      }
      case "conda": {
        return {
          type: "conda",
          registry: artInfo.registryName,
          package: artInfo.remoteArtifactLocation,

          cmd: ep.cmd,
          envVars: ep.env,

          ["micromamba-version"]: binPkg["micromamba-version"],
          ["conda-root-dir"]: binPkg["conda-root-dir"],

          spec: defaults.CONDA_FROZEN_ENV_SPEC_FILE,
        };
      }
      case "binary": {
        return {
          type: "binary",
          registry: artInfo.registryName,
          package: artInfo.remoteArtifactLocation,

          cmd: ep.cmd,
          envVars: ep.env,
        };
      }
      case "java": {
        return {
          type: "java",
          registry: artInfo.registryName,
          package: artInfo.remoteArtifactLocation,

          cmd: ep.cmd,
          envVars: ep.env,
          runEnv: resolveRunEnvironment(
            this.logger,
            this.pkgInfo.packageRoot,
            this.pkgInfo.packageName,
            binPkg.environment,
            binPkg.type,
          ),
        };
      }
      case "python": {
        const { toolset, ...deps } = binPkg.dependencies ?? {};

        return {
          type: "python",
          registry: artInfo.registryName,
          package: artInfo.remoteArtifactLocation,

          cmd: ep.cmd,
          envVars: ep.env,
          runEnv: resolveRunEnvironment(
            this.logger,
            this.pkgInfo.packageRoot,
            this.pkgInfo.packageName,
            binPkg.environment,
            binPkg.type,
          ),
          toolset: toolset ?? "pip",
          dependencies: deps,
        };
      }
      case "R": {
        return {
          type: "R",
          registry: artInfo.registryName,
          package: artInfo.remoteArtifactLocation,

          cmd: ep.cmd,
          envVars: ep.env,
          runEnv: resolveRunEnvironment(
            this.logger,
            this.pkgInfo.packageRoot,
            this.pkgInfo.packageName,
            binPkg.environment,
            binPkg.type,
          ),
          toolset: "renv",
          dependencies: {},
        };
      }
      default: {
        util.assertNever(pkgType);
        throw new Error(
          "internal build script logic error: renderBinaryInfo does not cover all package types",
        );
      }
    }
  }

  private renderRunEnvInfo(
    mode: util.BuildMode,
    epName: string,
    ep: entrypoint.PackageEntrypoint,
    requireArtifactInfo?: boolean,
  ): swJson.runEnvInfo | undefined {
    switch (mode) {
      case "release":
        break;

      case "dev-local":
        throw util.CLIError(`run environments do not support 'local' dev build mode yet`);

      default:
        util.assertNever(mode);
    }

    ep = requireEntrypointType(ep, "environment", `internal build script logic error`);
    const envArtifact = requireArtifactType(
      ep.artifact,
      "environment",
      `could not render 'environment' entrypoint`,
    );

    // TODO: we need to collect artifact info for all platforms
    const artInfoPath = this.pkgInfo.artifactInfoLocation(
      envArtifact.id,
      "archive",
      util.currentPlatform(),
    );
    const artInfo = readArtifactInfoIfExists(artInfoPath, epName, requireArtifactInfo);
    if (!artInfo) {
      return undefined;
    }

    return {
      type: envArtifact.runtime,

      ["r-version"]: envArtifact["r-version"],
      ["python-version"]: envArtifact["python-version"],
      ["java-version"]: envArtifact["java-version"],

      envVars: envArtifact.envVars ?? [],
      registry: artInfo.registryName!,
      package: artInfo.remoteArtifactLocation,
      binDir: envArtifact.binDir,
    };
  }

  private renderAssetInfo(
    mode: util.BuildMode,
    epName: string,
    ep: entrypoint.PackageEntrypoint,
    requireArtifactInfo?: boolean,
  ): swJson.assetInfo | undefined {
    switch (mode) {
      case "release":
        break;

      case "dev-local":
        throw util.CLIError(`assets do not support 'local' dev build mode yet`);

      default:
        util.assertNever(mode);
    }

    ep = requireEntrypointType(ep, "asset", `internal build script logic error`);
    const assetPkg = requireArtifactType(
      ep.artifact,
      "asset",
      `could not render 'asset' entrypoint`,
    );

    if (assetPkg.type !== "asset") {
      throw util.CLIError(`could not render asset entrypoint '${epName}': not 'asset' artifact`);
    }

    const artInfoPath = this.pkgInfo.artifactInfoLocation(assetPkg.id, "archive", undefined);
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

  private renderDockerInfo(
    epName: string,
    ep: entrypoint.PackageEntrypoint,
    requireArtifactInfo?: boolean,
  ): swJson.dockerInfo | undefined {
    ep = requireEntrypointType(ep, "software", `internal build script logic error`);
    const dockerArtifact = requireArtifactType(
      ep.artifact,
      "docker",
      `could not render 'docker' entrypoint`,
    );

    const artInfoPath = this.pkgInfo.artifactInfoLocation(
      dockerArtifact.id,
      "docker",
      util.currentArch(),
    );
    const artInfo = readArtifactInfoIfExists(artInfoPath, epName, requireArtifactInfo);
    if (!artInfo) {
      return undefined;
    }

    return {
      tag: artInfo.remoteArtifactLocation,
      entrypoint: artInfo.entrypoint ?? [],
      cmd: ep.cmd,
      pkg: dockerArtifact.pkg || "/",
    };
  }
}

export const compiledSoftwareSuffix = ".sw.json";
export const compiledAssetSuffix = ".as.json";

export type builtArtifactInfo = {
  type: artifacts.artifactType;
  platform: util.PlatformType;
  registryURL?: string; // registry public URL (for assets)
  registryName?: string; // name of registry (for binary and asset archives)
  remoteArtifactLocation: string; // path to put into sw.json or as.json file
  uploadPath?: string; // custom upload path if it does not match pathForSwJson

  // docker-specific fields
  entrypoint?: string[]; // entrypoint of resulting docker image. Can be overriden by setting in package.json

  // conda-specific fields
  spec?: string; // path to spec.yaml file within conda package
  ["micromamba-version"]?: string; // version of micromamba used in this conda package
};

export function writeBuiltArtifactInfo(location: string, locInfo: builtArtifactInfo) {
  fs.mkdirSync(path.dirname(location), { recursive: true });
  fs.writeFileSync(location, JSON.stringify(locInfo), { encoding: "utf8" });
}

export function readBuiltArtifactInfo(location: string): builtArtifactInfo {
  const data = fs.readFileSync(location, "utf8");
  return JSON.parse(data) as builtArtifactInfo;
}

function readArtifactInfoIfExists(
  location: string,
  epName: string,
  requireExisting?: boolean,
): builtArtifactInfo | undefined {
  if (fs.existsSync(location)) {
    return readBuiltArtifactInfo(location);
  }

  if (requireExisting) {
    throw util.CLIError(
      `could not render docker entrypoint '${epName}': artifact info file '${location}' does not exist`,
    );
  }

  return undefined;
}

function requireEntrypointType(
  ep: entrypoint.PackageEntrypoint,
  type: "asset",
  errMsg: string,
): entrypoint.AssetEntrypoint;
function requireEntrypointType(
  ep: entrypoint.PackageEntrypoint,
  type: "software",
  errMsg: string,
): entrypoint.SoftwareEntrypoint;
function requireEntrypointType(
  ep: entrypoint.PackageEntrypoint,
  type: "environment",
  errMsg: string,
): entrypoint.EnvironmentEntrypoint;
function requireEntrypointType(
  ep: entrypoint.PackageEntrypoint,
  type: entrypoint.EntrypointType,
  errMsg: string,
): entrypoint.PackageEntrypoint {
  if (ep.type === type) {
    return ep;
  }

  throw new Error(`${errMsg}: entrypoint ${ep.name} (${ep.type}) is not '${type}'`);
}

function requireArtifactType(
  pkg: artifacts.withId<artifacts.anyArtifactType>,
  type: "asset",
  errMsg: string,
): artifacts.withId<artifacts.assetType>;
function requireArtifactType(
  pkg: artifacts.withId<artifacts.anyArtifactType>,
  type: "environment",
  errMsg: string,
): artifacts.withId<artifacts.environmentType>;
function requireArtifactType(
  pkg: artifacts.withId<artifacts.anyArtifactType>,
  type: "java",
  errMsg: string,
): artifacts.withId<artifacts.javaType>;
function requireArtifactType(
  pkg: artifacts.withId<artifacts.anyArtifactType>,
  type: "python",
  errMsg: string,
): artifacts.withId<artifacts.pythonType>;
function requireArtifactType(
  pkg: artifacts.withId<artifacts.anyArtifactType>,
  type: "R",
  errMsg: string,
): artifacts.withId<artifacts.rType>;
function requireArtifactType(
  pkg: artifacts.withId<artifacts.anyArtifactType>,
  type: "binary",
  errMsg: string,
): artifacts.withId<artifacts.binaryType>;
function requireArtifactType(
  pkg: artifacts.withId<artifacts.anyArtifactType>,
  type: "docker",
  errMsg: string,
): artifacts.withId<artifacts.dockerType>;
function requireArtifactType(
  pkg: artifacts.withId<artifacts.anyArtifactType>,
  type: "conda",
  errMsg: string,
): artifacts.withId<artifacts.condaType>;
function requireArtifactType(
  pkg: artifacts.withId<artifacts.anyArtifactType>,
  type: artifacts.artifactType,
  errMsg: string,
): artifacts.withId<artifacts.anyArtifactType> {
  if (pkg.type === type) {
    return pkg;
  }

  if (errMsg) {
    errMsg = `${errMsg}: `;
  }

  throw util.CLIError(`${errMsg}artifact '${pkg.id}' ('${pkg.type}') is not '${type}'`);
}
