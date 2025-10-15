import * as path from 'node:path';
import * as fs from 'node:fs';
import type winston from 'winston';

import { z, ZodError } from 'zod';
import * as util from './util';
import * as envs from './envs';
import * as artifacts from './schemas/artifacts';
import * as entrypoint from './schemas/entrypoints';
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
        const artifactID = typeof ep.docker.artifact === 'string' ? ep.docker.artifact : epName;
        const artifact = this.getArtifact(artifactID, 'docker');
        // will mix docker to separate entrypoint
        // render function have to merge
        list.set(docker.entrypointName(epName), {
          type: 'software',
          name: epName,
          artifact: artifact,
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
        const artifactID = typeof ep.binary.artifact === 'string' ? ep.binary.artifact : epName;
        const artifact = this.getArtifact(artifactID, 'any');
        if (artifact.type === 'asset') {
          throw util.CLIError(`binary entrypoint cannot point to asset artifact: ${epName}`);
        }
        if (artifact.type === 'environment') {
          throw util.CLIError(`binary entrypoint cannot point to environment artifact: ${epName}`);
        }

        list.set(epName, {
          type: 'software',
          name: epName,
          artifact: artifact,
          cmd: ep.binary.cmd,
          env: ep.binary.envVars ?? [],
        });

        const shouldGenerateDockerEntrypoint = !ep.docker && artifacts.isDockerRequired(artifact.type);
        if (shouldGenerateDockerEntrypoint) {
          list.set(docker.entrypointName(epName), {
            type: 'software',
            name: epName,
            artifact: this.prepareDockerPackage(artifact),
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
          artifact: this.getArtifact(packageID, 'environment'),
          env: ep.environment.envVars ?? [],
        });
        continue;
      }

      if (ep.asset) {
        const packageID = typeof ep.asset === 'string' ? ep.asset : epName;
        list.set(epName, {
          type: 'asset',
          name: epName,
          artifact: this.getArtifact(packageID, 'asset'),
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
  get packages(): Map<string, artifacts.withId<artifacts.config>> {
    const result = new Map<string, artifacts.withId<artifacts.config>>();

    for (const ep of this.entrypoints.values()) {
      if (ep.type === 'reference') {
        // Entrypoint references are not buildable
        continue;
      }

      if (!result.has(ep.artifact.id)) {
        result.set(ep.artifact.id, ep.artifact);
      }
    }

    return result;
  }

  public artifactInfoLocation(pkgID: string, artifactType: 'docker', platform: util.ArchType): string;
  public artifactInfoLocation(pkgID: string, artifactType: 'archive', platform?: util.PlatformType): string;
  public artifactInfoLocation(pkgID: string, artifactType: 'archive' | 'docker', platform?: util.PlatformType | util.ArchType): string {
    const platformPart = platform ? `_${platform}` : '';
    return path.resolve(this.packageRoot, 'dist', 'artifacts', pkgID, `${artifactType}${platformPart}.json`);
  }

  private prepareDockerPackage(artifact: artifacts.withId<artifacts.config>): artifacts.withId<artifacts.dockerPackageConfig> {
    if (artifact.type !== 'python') {
      throw util.CLIError(`Auto Docker entrypoint only supported for Python, got '${artifact.type}'.`);
    }

    const options = prepareDockerOptions(this.logger, this.packageRoot, this.packageName, artifact.id, artifact);
    return {
      id: artifact.id,
      type: 'docker',
      registry: docker.defaultDockerRegistry,
      ...options,
    };
  }

  public getArtifact(id: string, type: 'asset'): artifacts.withId<artifacts.withType<'asset', artifacts.assetPackageConfig>>;
  public getArtifact(id: string, type: 'environment'): artifacts.withId<artifacts.environmentConfig>;
  public getArtifact(id: string, type: 'binary'): artifacts.withId<artifacts.binaryPackageConfig>;
  public getArtifact(id: string, type: 'java'): artifacts.withId<artifacts.javaPackageConfig>;
  public getArtifact(id: string, type: 'python'): artifacts.withId<artifacts.pythonPackageConfig>;
  public getArtifact(id: string, type: 'R'): artifacts.withId<artifacts.rPackageConfig>;
  public getArtifact(id: string, type: 'docker'): artifacts.withId<artifacts.dockerPackageConfig>;
  public getArtifact(id: string, type: 'conda'): artifacts.withId<artifacts.condaPackageConfig>;
  public getArtifact(id: string, type: 'any'): artifacts.withId<artifacts.config>;
  public getArtifact(id: string, type: artifacts.artifactType | 'any'): artifacts.withId<artifacts.config> {
    const artifacts = this.pkgJson['block-software'].artifacts ?? {};
    const entrypoints = this.pkgJson['block-software'].entrypoints;

    let artifact: artifacts.config | undefined;
    let errMsg = '';
    if (artifacts[id]) {
      artifact = artifacts[id];
    } else {
      const ep = entrypoints[id];
      if (!ep) {
        throw util.CLIError(
          `artifact with id '${id}' not found neither in 'entrypoints', nor in 'artifacts'`,
        );
      }

      errMsg = `incorrect artifact reference in entrypoint '${id}'`;

      if (ep.asset) {
        artifact = this.resolveArtifact(ep.asset);
      } else if (ep.binary && type !== 'docker') { // single entrypoint can keep both binary and docker
        artifact = this.resolveArtifact(ep.binary.artifact);
      } else if (ep.conda && type !== 'docker') { // single entrypoint can keep both conda and docker
        artifact = this.resolveArtifact(ep.conda.artifact);
      } else if (ep.environment) {
        artifact = this.resolveArtifact(ep.environment.artifact);
      } else if (ep.docker) {
        artifact = this.resolveArtifact(ep.docker.artifact);
      }
    }

    if (!artifact) {
      throw util.CLIError(
        `artifact '${id}' not found neither in 'entrypoints', nor in 'artifacts'`,
      );
    }

    switch (type) {
      case 'docker': {
        return {
          id: id,
          ...requireArtifactType(artifact, 'docker', errMsg),
        };
      }
      case 'asset': {
        return {
          id: id,
          ...requireArtifactType(artifact, 'asset', errMsg),
        };
      }
      case 'environment': {
        return {
          id: id,
          ...requireArtifactType(artifact, 'environment', errMsg),
        };
      }
      case 'binary': {
        return {
          id: id,
          ...requireArtifactType(artifact, 'binary', errMsg),
        };
      }
      case 'java': {
        return {
          id: id,
          ...requireArtifactType(artifact, 'java', errMsg),
        };
      }
      case 'python': {
        return {
          id: id,
          ...requireArtifactType(artifact, 'python', errMsg),
        };
      }
      case 'R': {
        return {
          id: id,
          ...requireArtifactType(artifact, 'R', errMsg),
        };
      }
      case 'conda': {
        return {
          id: id,
          ...requireArtifactType(artifact, 'conda', errMsg),
        };
      }
      case 'any': {
        return {
          id: id,
          ...artifact,
        };
      }
      default: {
        util.assertNever(type);
        throw util.CLIError(`invalid artifact type`); // calm down the linter
      }
    }
  }

  public set version(v: string | undefined) {
    this._versionOverride = v;
  }

  public artifactName(artifact: artifacts.withId<artifacts.config>): string {
    if (artifact.type !== 'docker') {
      if (artifact.name) {
        return artifact.name;
      }
    }

    return util.trimPrefix(this.pkgJson.name, '@') + '/' + artifact.id;
  }

  public artifactVersion(artifact: artifacts.config): string {
    if (this._versionOverride) {
      return this._versionOverride;
    }

    if (process.env[envs.PL_PKG_VERSION]) {
      return process.env[envs.PL_PKG_VERSION];
    }

    if (artifact.type !== 'docker' && artifact.version) {
      return artifact.version;
    }

    return this.pkgJson.version;
  }

  public artifactRegistrySettings(artifact: artifacts.config): artifacts.registry {
    if (artifact.type === 'docker') {
      return {
        name: artifact.registry,
      };
    }

    const registry = artifact.registry;
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

  public artifactContentRoot(artifact: artifacts.withId<artifacts.config>, platform: util.PlatformType): string {
    if (('root' in artifact) && artifact.root) {
      return path.resolve(this.packageRoot, artifact.root);
    }
    if (('roots' in artifact) && artifact.roots[platform]) {
      return path.resolve(this.packageRoot, artifact.roots[platform]);
    }

    throw util.CLIError(
      `root path of software archive on ${platform} is undefined for binary package`,
    );
  }

  public artifactPlatforms(artifact: artifacts.withId<artifacts.config>): util.PlatformType[] {
    if (artifact.type === 'docker') {
      return [util.currentPlatform()];
    }

    if (('root' in artifact) && artifact.root) {
      return [util.currentPlatform()];
    }

    if (('roots' in artifact)) {
      return Object.keys(artifact.roots) as util.PlatformType[];
    }

    throw util.CLIError(
      `no platforms are defined as supported for artifact '${artifact.id}' in binary mode `
      + `(no 'roots' are defined)`,
    );
  }

  public artifactArchiveFullName(
    artifact: artifacts.withId<artifacts.config>,
    platform: util.PlatformType,
  ): string {
    const group = artifact.type === 'asset' ? 'assets' : 'software';
    const extension = artifact.type === 'asset' ? 'zip' : 'tgz';
    const name = this.artifactName(artifact);
    const version = this.artifactVersion(artifact);

    if (artifacts.isCrossPlatform(artifact.type)) {
      return `${group}/${name}/${version}.${extension}`;
    }

    const { os, arch } = util.splitPlatform(platform);
    return `${group}/${name}/${version}-${os}-${arch}.${extension}`;
  }

  public artifactArchiveAddressPattern(
    artifact: artifacts.withId<artifacts.config>,
  ): string {
    const group = artifact.type === 'asset' ? 'assets' : 'software';
    const extension = artifact.type === 'asset' ? 'zip' : 'tgz';
    const name = this.artifactName(artifact);
    const version = this.artifactVersion(artifact);

    if (artifacts.isCrossPlatform(artifact.type)) {
      return `${group}/${name}/${version}.${extension}`;
    }

    return `${group}/${name}/${version}-{os}-{arch}.${extension}`;
  }

  private validateConfig() {
    let hasErrors: boolean = false;

    const blockSoftware = this.pkgJson['block-software'];

    const as = blockSoftware.artifacts ?? {};
    const entrypoints = blockSoftware.entrypoints ?? {};

    for (const [epName, ep] of Object.entries(entrypoints)) {
      if (ep.binary) {
        const artifactID = typeof ep.binary.artifact === 'string' ? ep.binary.artifact : epName;
        const artifact = this.getArtifact(artifactID, 'any');

        if (!artifact) {
          this.logger.error(
            `entrypoint '${epName}' refers to artifact '${artifactID}' which is not defined in '${util.softwareConfigName}'`,
          );
          hasErrors = true;
        }

        if (!this.validateArtifact(artifactID, artifact)) {
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
        const artifactID
          = typeof ep.environment.artifact === 'string' ? ep.environment.artifact : epName;
        const artifact = this.getArtifact(artifactID, 'any');

        if (!artifact) {
          this.logger.error(
            `entrypoint '${epName}' refers to artifact '${artifactID}' which is not defined in '${util.softwareConfigName}'`,
          );
          hasErrors = true;
        }

        if (!this.validateArtifact(artifactID, artifact)) {
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

    for (const [artifactID, artifact] of Object.entries(as)) {
      if (!artifacts.isBuildable(artifact.type)) {
        continue;
      }

      if (!this.validateArtifact(artifactID, artifact)) {
        hasErrors = true;
      }

      const name = this.artifactName({ id: artifactID, ...artifact });
      const version = this.artifactVersion(artifact);
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

  private resolveArtifact(idOrSchema: string | artifacts.config): artifacts.config | undefined {
    if (typeof idOrSchema === 'string') {
      const artifacts = this.pkgJson['block-software'].artifacts ?? {};
      return artifacts[idOrSchema] ?? undefined;
    }

    return idOrSchema;
  }

  private validateArtifact(artifactName: string, artifact: artifacts.config): boolean {
    if (artifacts.isBuildable(artifact.type)) {
      // Validate that root is not equal to package root
      const resolvedRoots: string[] = [];
      const aType = artifact.type;
      switch (aType) {
        case 'asset':
        case 'java':
        case 'R':
        case 'python': {
          resolvedRoots.push(path.resolve(this.packageRoot, artifact.root));
          break;
        }
        case 'docker': {
          resolvedRoots.push(path.resolve(this.packageRoot, artifact.context));
          break;
        }
        case 'environment':
        case 'conda':
        case 'binary': {
          resolvedRoots.push(...Object.values(artifact.roots).map((root) => path.resolve(this.packageRoot, root)));
          break;
        }
        default: util.assertNever(aType);
      }

      for (const root of resolvedRoots) {
        if (root === this.packageRoot) {
          this.logger.error(
            `Invalid configuration: '${artifact.type}' artifact '${artifactName}' has 'root' set to the package root, which is not allowed`,
          );
          return false;
        }
      }
    }

    return true;
  }
}

const readPackageJson = (filePath: string) => parsePackageJson(fs.readFileSync(filePath, 'utf8'));
function parsePackageJson(data: string) {
  const parsedData: unknown = JSON.parse(data);
  return packageJsonSchema.parse(parsedData);
}

function requireArtifactType(artifact: artifacts.config, type: 'asset', errMsg: string): artifacts.withType<'asset', artifacts.assetPackageConfig>;
function requireArtifactType(artifact: artifacts.config, type: 'environment', errMsg: string): artifacts.environmentConfig;
function requireArtifactType(artifact: artifacts.config, type: 'java', errMsg: string): artifacts.javaPackageConfig;
function requireArtifactType(artifact: artifacts.config, type: 'python', errMsg: string): artifacts.pythonPackageConfig;
function requireArtifactType(artifact: artifacts.config, type: 'R', errMsg: string): artifacts.rPackageConfig;
function requireArtifactType(artifact: artifacts.config, type: 'binary', errMsg: string): artifacts.binaryPackageConfig;
function requireArtifactType(artifact: artifacts.config, type: 'docker', errMsg: string): artifacts.dockerPackageConfig;
function requireArtifactType(artifact: artifacts.config, type: 'conda', errMsg: string): artifacts.condaPackageConfig;
function requireArtifactType(artifact: artifacts.config, type: artifacts.artifactType, errMsg: string): artifacts.config {
  if (artifact.type === type) {
    return artifact;
  }

  if (errMsg) {
    errMsg = `${errMsg}: `;
  }

  throw util.CLIError(
    `${errMsg}wrong artifact type: expected '${type}', got '${artifact.type}'`,
  );
}
