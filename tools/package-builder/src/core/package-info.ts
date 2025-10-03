import * as path from 'node:path';
import * as fs from 'node:fs';
import type winston from 'winston';

import { z, ZodError } from 'zod';
import * as util from './util';
import * as envs from './envs';
import * as artifacts from './schemas/artifacts';
import * as entrypoint from './schemas/entrypoint';
import { tryResolve } from '@milaboratories/resolve-helper';
import * as docker from './docker';
import { prepareDockerOptions } from './docker-python';

const storagePresetSchema = z.object({
  downloadURL: z.string().optional(),
  storageURL: z.string().optional(),
});
type storagePreset = z.infer<typeof storagePresetSchema>;

const binaryRegistryPresetsSchema = z.record(z.string(), storagePresetSchema);
type binaryRegistryPresets = z.infer<typeof binaryRegistryPresetsSchema>;

const packageJsonSchema = z.object({
  'name': z.string(),
  'version': z.string(),
  'private': z.boolean().optional(),

  'block-software': z.object({
    registries: z
      .object({
        binary: binaryRegistryPresetsSchema.optional(),
      })
      .optional(),

    artifacts: artifacts.listSchema.optional(),
    entrypoints: entrypoint.listSchema,
  }),
});
type packageJson = z.infer<typeof packageJsonSchema>;

const wellKnownRegistries: Record<string, storagePreset> = {
  'platforma-open': {
    downloadURL: 'https://bin.pl-open.science/',
  },
};

/*
 * package.json -> block-software structure example:
 * {
 *   "block-software": {
 *     "registries": {
 *       "binary": {
 *         "default": { "uploadURL": "s3://<bucket>/<some-prefix>?region=<region-name>" }
 *       }
 *     },
 *
 *     "artifacts": {
 *       "pkg-1": {
 *         "type": "binary",
 *         "roots": {
 *           "linux-x64": "./linux-x64/src",
 *           "linux-aarch64": "./linux-aarch/src",
 *           "...and so on...": "platform-dependant roots",
 *         }
 *       }
 *     }
 *
 *     "entrypoints": {
 *       "script1": {
 *         "software": {
 *           "artifact": "pkg-1",
 *           "cmd": [ "{pkg}/script1" ]
 *         }
 *       }
 *     }
 *   }
 * }
 */
export class PackageInfo {
  public readonly packageRoot: string;
  public readonly packageName: string;

  private readonly pkgJson: packageJson;
  private _versionOverride: string | undefined;

  constructor(
    private logger: winston.Logger,
    options?: {
      packageRoot?: string;
      pkgJsonData?: string;
    },
  ) {
    this.logger.debug('Reading package information...');

    this.packageRoot = options?.packageRoot ?? util.findPackageRoot(logger);

    if (options?.pkgJsonData) {
      this.pkgJson = parsePackageJson(options.pkgJsonData);
    } else {
      const pkgJsonPath = path.resolve(this.packageRoot, util.packageJsonName);

      try {
        this.logger.debug(`  - loading '${pkgJsonPath}'`);
        if (!fs.existsSync(pkgJsonPath)) {
          this.logger.error(`no '${util.packageJsonName}' file found at '${this.packageRoot}'`);
          throw util.CLIError('not a platform software package directory');
        }

        this.pkgJson = readPackageJson(pkgJsonPath);
        this.logger.debug('    ' + JSON.stringify(this.pkgJson));
      } catch (e) {
        if (e instanceof ZodError) {
          const errLines: string[] = [`Failed to read and parse '${util.packageJsonName}':`];
          errLines.push(...(util.formatZodError(e).map((line) => `  ${line}`)));
          throw util.CLIError(errLines.join('\n'));
        }

        this.logger.error(`Failed to read and parse '${util.packageJsonName}':`, e);
        throw e;
      }
    }

    this.validateConfig();

    this.packageName = this.pkgJson.name;

    logger.debug('  package information loaded successfully.');
  }

  get isPrivate(): boolean {
    return this.pkgJson.private ?? false;
  }

  get binaryRegistries(): binaryRegistryPresets {
    return this.pkgJson['block-software'].registries?.binary ?? {};
  }

  get entrypoints(): Map<string, entrypoint.Entrypoint> {
    const list = new Map<string, entrypoint.Entrypoint>();

    for (const [epName, ep] of Object.entries(this.pkgJson['block-software'].entrypoints)) {
      if (ep.docker) {
        const packageID = typeof ep.docker.artifact === 'string' ? ep.docker.artifact : epName;
        const pkg = this.getPackage(packageID, 'docker');
        // will mix docker to separate entrypoint
        // render function have to merge
        list.set(docker.entrypointName(epName), {
          type: 'software',
          name: epName,
          package: pkg,
          cmd: ep.docker.cmd ?? [],
          env: ep.docker.envVars ?? [],
        });
      }

      if (ep.reference) {
        list.set(epName, {
          type: 'reference',
          name: epName,
          reference: ep.reference,
        });
        continue;
      }

      if (ep.binary) {
        const packageID = typeof ep.binary.artifact === 'string' ? ep.binary.artifact : epName;
        const pkg = this.getPackage(packageID);
        list.set(epName, {
          type: 'software',
          name: epName,
          package: pkg,
          cmd: ep.binary.cmd,
          env: ep.binary.envVars ?? [],
        });

        const shouldGenerateDockerEntrypoint = !ep.docker && artifacts.isDockerRequired(pkg.type);
        if (shouldGenerateDockerEntrypoint) {
          list.set(docker.entrypointName(epName), {
            type: 'software',
            name: epName,
            package: this.prepareDockerPackage(pkg),
            cmd: ep.binary.cmd ?? [],
            env: ep.binary.envVars ?? [],
          });
        }
        continue;
      }

      if (ep.environment) {
        const packageID
          = typeof ep.environment.artifact === 'string' ? ep.environment.artifact : epName;
        list.set(epName, {
          type: 'environment',
          name: epName,
          package: this.getPackage(packageID),
          env: ep.environment.envVars ?? [],
        });
        continue;
      }

      if (ep.asset) {
        const packageID = typeof ep.asset === 'string' ? ep.asset : epName;
        list.set(epName, {
          type: 'asset',
          name: epName,
          package: this.getPackage(packageID),
        });
        continue;
      }

      if (list.size === 0) {
        throw util.CLIError(
          `entrypoint '${epName}' type is not supported by current platforma package builder`,
        );
      }
    }

    return list;
  }

  // Get not docker entrypoint if exists.
  // If only docker entrypoint exists, return it.
  public getMainEntrypoint(name: string): entrypoint.Entrypoint {
    const ep = this.entrypoints.get(name);
    if (ep) {
      return ep;
    }

    return this.entrypoints.get(docker.entrypointName(name))!;
  }

  /**
   * Resolves entrypoint reference to full entrypoint file path and type
   */
  public resolveReference(epName: string, ep: entrypoint.ReferenceEntrypoint): string {
    this.logger.debug(`resolving entrypoint '${epName}' reference '${ep.reference}'. packageRoot='${this.packageRoot}'`);

    const refInfo = ep.reference.match(entrypoint.EnyrypointReferencePattern)?.groups;

    if (!refInfo) {
      this.logger.error(
        `entrypoint reference '${epName}' has incorrect reference format. <full package name>/<path to entrypoint> is expected`,
      );
      throw util.CLIError(`invalid entrypoint '${epName}' reference format`);
    }

    const refPath = tryResolve(this.packageRoot, ep.reference);
    if (!refPath) {
      this.logger.error(`entrypoint reference '${epName}' cannot be resolved into file path`);
      throw util.CLIError(`invalid entrypoint '${epName}' reference`);
    }

    return refPath;
  }

  // Packages are buildable artifacts with entrypoints
  get packages(): Map<string, entrypoint.PackageConfig> {
    const result = new Map<string, entrypoint.PackageConfig>();

    for (const ep of this.entrypoints.values()) {
      if (ep.type === 'reference') {
        // Entrypoint references are not buildable
        continue;
      }

      if (!result.has(ep.package.id)) {
        result.set(ep.package.id, ep.package);
      }
    }

    return result;
  }

  public getPackage(id: string, type?: string): entrypoint.PackageConfig {
    const artifact = this.getArtifact(id, type);
    return this.makePackageConfig(id, artifact);
  }

  public artifactInfoLocation(pkgID: string, artifactType: 'docker', platform: util.ArchType): string;
  public artifactInfoLocation(pkgID: string, artifactType: 'archive', platform?: util.PlatformType): string;
  public artifactInfoLocation(pkgID: string, artifactType: 'archive' | 'docker', platform?: util.PlatformType | util.ArchType): string {
    const platformPart = platform ? `_${platform}` : '';
    return path.resolve(this.packageRoot, 'dist', 'artifacts', pkgID, `${artifactType}${platformPart}.json`);
  }

  private makePackageConfig(id: string, artifact: artifacts.config): entrypoint.PackageConfig {
    const pkgRoot = this.packageRoot;

    const crossplatform
      = artifact.roots !== undefined ? false : artifacts.isCrossPlatform(artifact.type);

    return {
      id: id,

      ...artifact,

      registry: this.binRegistryFor(artifact.registry),
      name: this.getName(id, artifact.name),
      version: this.getVersion(artifact.version),
      crossplatform: crossplatform,

      fullName(platform: util.PlatformType): string {
        const ext = artifact.type === 'asset' ? 'zip' : 'tgz';
        const grp = artifact.type === 'asset' ? 'assets' : 'software';
        return archiveFullName(grp, crossplatform, this.name, this.version, platform, ext);
      },

      get namePattern(): string {
        const ext = artifact.type === 'asset' ? 'zip' : 'tgz';
        const grp = artifact.type === 'asset' ? 'assets' : 'software';
        return archiveAddressPattern(grp, crossplatform, this.name, this.version, ext);
      },

      get isBuildable(): boolean {
        return artifacts.isBuildable(this.type);
      },

      get isMultiroot(): boolean {
        return Object.keys(this.roots || {}).length > 0;
      },

      contentRoot(platform: util.PlatformType): string {
        const root = this.root ?? this.roots?.[platform];
        if (!root) {
          throw util.CLIError(
            `root path for software archive of platform ${platform} is undefined for binary package`,
          );
        }

        return path.resolve(pkgRoot, root);
      },

      get platforms(): util.PlatformType[] {
        if (artifact?.root || artifact?.type === 'docker') return [util.currentPlatform()];
        if (artifact?.roots) return Object.keys(artifact.roots) as util.PlatformType[];

        throw util.CLIError(
          `no platforms are defined as supported for package '${id}' in binary mode `
          + `(no 'root' or 'roots' are defined)`,
        );
      },
    };
  }

  private prepareDockerPackage(pkg: entrypoint.PackageConfig): entrypoint.PackageConfig {
    if (pkg.type !== 'python') {
      throw util.CLIError(`Auto Docker entrypoint only supported for Python, got '${pkg.type}'.`);
    }

    const options = prepareDockerOptions(this.logger, this.packageRoot, this.packageName, pkg.id, pkg);
    const artifact: artifacts.dockerPackageConfig = {
      type: 'docker',
      ...options,
    };

    return this.makePackageConfig(pkg.id, artifact);
  }

  private getArtifact(id: string, type?: string): artifacts.config {
    const artifacts = this.pkgJson['block-software'].artifacts ?? {};
    const entrypoints = this.pkgJson['block-software'].entrypoints;

    if (artifacts[id]) {
      return artifacts[id];
    }

    const ep = entrypoints[id];
    if (!ep) {
      throw util.CLIError(
        `artifact with id '${id}' not found neither in 'entrypoints', nor in 'artifacts'`,
      );
    }

    if (ep.asset && typeof ep.asset !== 'string') {
      return {
        type: 'asset',
        ...ep.asset,
      };
    }

    switch (type) {
      case 'docker':
        if (typeof ep.docker!.artifact === 'string') {
          if (artifacts[ep.docker!.artifact]) {
            return artifacts[ep.docker!.artifact];
          }
          throw util.CLIError(
            `entrypoint '${id}' points to artifact '${ep.docker!.artifact}' which does not exist in 'artifacts'`,
          );
        }

        return ep.docker!.artifact;
      default:
        break;
    }

    const idOrArtifact = ep.asset ?? ep.environment?.artifact ?? ep.binary!.artifact;

    if (typeof idOrArtifact !== 'string') {
      return idOrArtifact;
    }

    if (artifacts[idOrArtifact]) {
      return artifacts[idOrArtifact];
    }

    throw util.CLIError(
      `entrypoint '${id}' points to artifact '${idOrArtifact}' which does not exist in 'artifacts'`,
    );
  }

  public set version(v: string | undefined) {
    this._versionOverride = v;
  }

  private getVersion(pkgVersion: string | undefined): string {
    if (this._versionOverride) {
      return this._versionOverride;
    }

    if (process.env[envs.PL_PKG_VERSION]) {
      return process.env[envs.PL_PKG_VERSION];
    }

    if (pkgVersion) {
      return pkgVersion;
    }

    return this.pkgJson.version;
  }

  private binRegistryFor(registry: artifacts.registry | string | undefined): artifacts.registry {
    const registries = this.binaryRegistries;

    const result: artifacts.registry = {
      name: 'default',
      downloadURL: registries.default?.downloadURL,
      storageURL: registries.default?.storageURL,
    };

    if (registry) {
      if (typeof registry === 'string') {
        result.name = registry;
        const regDefault = wellKnownRegistries[result.name];
        result.downloadURL = registries[result.name]?.downloadURL ?? regDefault?.downloadURL;
        result.storageURL = registries[result.name]?.storageURL ?? regDefault?.storageURL;
      } else {
        result.name = registry.name;
        const regDefault = wellKnownRegistries[result.name];
        result.downloadURL
          = registry.downloadURL ?? registries[result.name]?.downloadURL ?? regDefault?.downloadURL;
        result.storageURL
          = registry.storageURL ?? registries[result.name]?.storageURL ?? regDefault?.storageURL;
      }
    }

    const regNameUpper = result.name.toUpperCase().replaceAll(/[^A-Z0-9_]/g, '_');

    const uploadTo = process.env[`PL_REGISTRY_${regNameUpper}_UPLOAD_URL`];
    if (uploadTo) {
      result.storageURL = uploadTo;
    }

    const downloadFrom = process.env[`PL_REGISTRY_${regNameUpper}_DOWNLOAD_URL`];
    if (downloadFrom) {
      result.downloadURL = downloadFrom;
    }

    if (result.downloadURL) {
      const u = new URL(result.downloadURL, 'file:/nonexistent'); // check download URL is valid URL
      if (!['https:', 'http:'].includes(u.protocol)) {
        throw util.CLIError(
          `registry ${result.name} download URL is not valid. Only 'https://' and 'http://' schemes are supported for now`,
        );
      }
    }

    return result;
  }

  private validateConfig() {
    let hasErrors: boolean = false;

    const blockSoftware = this.pkgJson['block-software'];

    const as = blockSoftware.artifacts ?? {};
    const entrypoints = blockSoftware.entrypoints ?? {};

    for (const [epName, ep] of Object.entries(entrypoints)) {
      if (ep.binary) {
        const artifactName = typeof ep.binary.artifact === 'string' ? ep.binary.artifact : epName;
        const artifact = this.getArtifact(artifactName);

        if (!artifact) {
          this.logger.error(
            `entrypoint '${epName}' refers to artifact '${artifactName}' which is not defined in '${util.softwareConfigName}'`,
          );
          hasErrors = true;
        }

        if (!this.validateArtifact(artifactName, artifact)) {
          hasErrors = true;
        }

        if (!artifacts.isBuildable(artifact.type)) {
          this.logger.error(
            `entrypoint '${epName}' artifact type '${artifact.type}' is not buildable to binary package`,
          );
          hasErrors = true;
        }

        if (artifact.type === 'environment') {
          this.logger.error(
            `entrypoint '${epName}' artifact type '${artifact.type}' cannot be build into software pacakge. Use 'environment' entrypoint`,
          );
          hasErrors = true;
        }
      }

      if (ep.environment) {
        const artifactName
          = typeof ep.environment.artifact === 'string' ? ep.environment.artifact : epName;
        const artifact = this.getArtifact(artifactName);

        if (!artifact) {
          this.logger.error(
            `entrypoint '${epName}' refers to artifact '${artifactName}' which is not defined in '${util.softwareConfigName}'`,
          );
          hasErrors = true;
        }

        if (!this.validateArtifact(artifactName, artifact)) {
          hasErrors = true;
        }

        if (artifact.type !== 'environment') {
          this.logger.error(
            `entrypoint '${epName}' with 'environment' settings should refer to 'environment' artifact type`,
          );
          hasErrors = true;
        }
      }

      // TODO: add docker validation here
      // TODO(rfiskov)[MILAB-3163]: Carefully handle docker artifacts, as some (e.g., for Python) may be autogenerated dynamically rather than explicitly defined.
    }

    const uniquePackageNames = new Set<string>();

    for (const [artifactName, artifact] of Object.entries(as)) {
      if (!artifacts.isBuildable(artifact.type)) {
        continue;
      }

      if (!this.validateArtifact(artifactName, artifact)) {
        hasErrors = true;
      }

      const name = this.getName(artifactName, artifact.name);
      const version = this.getVersion(artifact.version);
      const uniqueName = `${name}-${version}`;
      if (uniquePackageNames.has(uniqueName)) {
        this.logger.error(
          `found two packages with the same name '${name}' and version '${version}'`,
        );
        hasErrors = true;
      }

      uniquePackageNames.add(uniqueName);
    }

    if (hasErrors) {
      throw util.CLIError(
        `${util.softwareConfigName} has xconfiguration errors in 'block-software' section. See error log messages above for details`,
      );
    }
  }

  private validateArtifact(artifactName: string, artifact: artifacts.config): boolean {
    if (artifacts.isBuildable(artifact.type)) {
      if (artifact.root && artifact.roots) {
        this.logger.error(
          `${artifact.type} artifact '${artifactName}' has both 'root' and 'roots' options. 'root' and 'roots' are mutually exclusive.`,
        );

        return false;
      }

      // Validate that root is not equal to package root
      if (artifact.root && (artifact.type === 'python' || artifact.type === 'binary')) {
        // Check relative paths
        if (artifact.root === '.' || artifact.root === './') {
          this.logger.error(
            `Invalid configuration: '${artifact.type}' artifact '${artifactName}' has 'root' set to the package root, which is not allowed`,
          );
          return false;
        }

        // Check if path resolves to package root
        const resolvedRoot = path.resolve(this.packageRoot, artifact.root);
        if (resolvedRoot === this.packageRoot) {
          this.logger.error(
            `Invalid configuration: '${artifact.type}' artifact '${artifactName}' has 'root' set to the package root, which is not allowed`,
          );
          return false;
        }
      }
    }

    return true;
  }

  private getName(artifactName: string, name?: string): string {
    if (name) {
      return name;
    }

    return util.trimPrefix(this.pkgJson.name, '@') + '/' + artifactName;
  }
}

const readPackageJson = (filePath: string) => parsePackageJson(fs.readFileSync(filePath, 'utf8'));
function parsePackageJson(data: string) {
  const parsedData: unknown = JSON.parse(data);
  return packageJsonSchema.parse(parsedData);
}

function archiveFullName(
  group: 'assets' | 'software',
  crossplatform: boolean,
  name: string,
  version: string,
  platform: util.PlatformType,
  extension: string,
): string {
  if (crossplatform) {
    return `${group}/${name}/${version}.${extension}`;
  }

  const { os, arch } = util.splitPlatform(platform);
  return `${group}/${name}/${version}-${os}-${arch}.${extension}`;
}

function archiveAddressPattern(
  group: 'assets' | 'software',
  crossplatform: boolean,
  name: string,
  version: string,
  extension: string,
): string {
  if (crossplatform) {
    return `${group}/${name}/${version}.${extension}`;
  }

  return `${group}/${name}/${version}-{os}-{arch}.${extension}`;
}
