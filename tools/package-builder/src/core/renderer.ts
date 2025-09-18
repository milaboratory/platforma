import path from 'node:path';
import fs from 'node:fs';
import type winston from 'winston';
import { z, ZodError } from 'zod';
import type { Entrypoint, EntrypointType, PackageEntrypoint, PackageInfo } from './package-info';
import * as artifacts from './schemas/artifacts';
import * as util from './util';
import * as docker from './docker';

const externalPackageLocationSchema = z.object({
  registry: z.string().describe('name of the registry to use for package download'),
  package: z
    .string()
    .describe('full package path in registry, e.g. \'common/jdk/21.0.2.13.1-{os}-{arch}.tgz'),
});

const assetSchema = z.object({
  ...externalPackageLocationSchema.shape,
  url: z.string().describe('asset download URL'),
});
type assetInfo = z.infer<typeof assetSchema>;

const dockerSchema = z.object({
  tag: z.string().describe('name of the image to be built instead of custom one'),
  entrypoint: z.array(z.string()).describe('entrypoint command to be run in the container'),
  cmd: z.array(z.string()).describe('command to be run in the container'),
  pkg: z.string().optional().describe('custom working directory in Docker container (only for Python packages)'),
});
type dockerInfo = z.infer<typeof dockerSchema>;

const runEnvironmentSchema = z.object({
  type: z.enum(artifacts.runEnvironmentTypes),
  ...externalPackageLocationSchema.shape,

  ['r-version']: z.string().optional(),
  ['python-version']: z.string().optional(),
  ['java-version']: z.string().optional(),

  envVars: z
    .array(
      z
        .string()
        .regex(
          /=/,
          'environment variable should be specified in format: <var-name>=<var-value>, i.e.: MY_ENV=value',
        ),
    ).optional(),

  binDir: z.string(),
});
type runEnvInfo = z.infer<typeof runEnvironmentSchema>;

const runDependencyJavaSchema = runEnvironmentSchema.extend({
  type: z.literal('java'),
  name: z
    .string()
    .describe('name used to import this package as software dependency of tengo script'),
});
type runEnvDependencyJava = z.infer<typeof runDependencyJavaSchema>;

const runDependencyPythonSchema = runEnvironmentSchema.extend({
  type: z.literal('python'),
  ['python-version']: z.string(),
  name: z
    .string()
    .describe('name used to import this package as software dependency of tengo script'),
});
type runEncDependencyPython = z.infer<typeof runDependencyPythonSchema>;

const runDependencyRSchema = runEnvironmentSchema.extend({
  type: z.literal('R'),
  ['r-version']: z.string(),
  name: z
    .string()
    .describe('name used to import this package as software dependency of tengo script'),
});
type runEnvDependencyR = z.infer<typeof runDependencyRSchema>;

const runDependencyCondaSchema = runEnvironmentSchema.extend({
  type: z.literal('conda'),
  name: z
    .string()
    .describe('name used to import this package as software dependency of tengo script'),
});
type runEnvDependencyConda = z.infer<typeof runDependencyCondaSchema>;

type runEnvDependencyInfo = runEnvDependencyJava | runEncDependencyPython | runEnvDependencyR | runEnvDependencyConda;

const anyPackageSettingsSchema = z.object({
  cmd: z.array(z.string()).min(1).describe('run given command, appended by args from workflow'),

  envVars: z
    .array(
      z
        .string()
        .regex(
          /=/,
          'full environment variable specification is required: <var-name>=<var-value>, e.g.: IS_CI=yes',
        ),
    )
    .optional(),
});

const binaryPackageSettingsSchema = z.object({
  type: z.literal('binary'),
  ...anyPackageSettingsSchema.shape,

  runEnv: z.undefined(),
  pkg: z.string().optional().describe('custom working directory in Docker container (default: /app)'),
});

const javaPackageSettingsSchema = z.object({
  type: z.literal('java'),

  ...anyPackageSettingsSchema.shape,
  runEnv: runDependencyJavaSchema,
});

const pythonPackageSettingsSchema = z.object({
  type: z.literal('python'),

  ...anyPackageSettingsSchema.shape,
  runEnv: runDependencyPythonSchema,

  toolset: z.string(),
  dependencies: z
    .record(z.string(), z.string())
    .describe(
      'paths of files that describe dependencies for given toolset: say, requirements.txt for \'pip\'',
    ),
  pkg: z.string().optional().describe('custom working directory in Docker container (default: /app)'),
});

const rPackageSettingsSchema = z.object({
  type: z.literal('R'),

  ...anyPackageSettingsSchema.shape,
  runEnv: runDependencyRSchema,

  toolset: z.string(),
  dependencies: z
    .record(z.string(), z.string())
    .describe(
      'paths of files that describe dependencies for given toolset: say, requirements.txt for \'pip\'',
    ),
});

const condaPackageSettingsSchema = z.object({
  type: z.literal('conda'),

  ...anyPackageSettingsSchema.shape,
  runEnv: runDependencyCondaSchema,

  renvLock: z
    .string()
    .optional()
    .describe('contents of renv.lock for R language virtual env bootstrap'),
});

const binarySchema = z.union([
  externalPackageLocationSchema.extend(binaryPackageSettingsSchema.shape),
  externalPackageLocationSchema.extend(javaPackageSettingsSchema.shape),
  externalPackageLocationSchema.extend(pythonPackageSettingsSchema.shape),
  externalPackageLocationSchema.extend(rPackageSettingsSchema.shape),
  externalPackageLocationSchema.extend(condaPackageSettingsSchema.shape),
]);
type binaryInfo = z.infer<typeof binarySchema>;

const localPackageLocationSchema = z.object({
  hash: z
    .string()
    .describe(
      'hash of software directory. Makes deduplication to work properly when you actively develop software',
    ),
  path: z.string().describe('absolute path to root directory of software on local host'),
});

const localSchema = z.discriminatedUnion('type', [
  localPackageLocationSchema.extend(binaryPackageSettingsSchema.shape),
  localPackageLocationSchema.extend(javaPackageSettingsSchema.shape),
  localPackageLocationSchema.extend(pythonPackageSettingsSchema.shape),
  localPackageLocationSchema.extend(rPackageSettingsSchema.shape),
  localPackageLocationSchema.extend(condaPackageSettingsSchema.shape),
]);
type localInfo = z.infer<typeof localSchema>;

const swJsonSchema = z
  .object({
    isDev: z.boolean().optional(),

    asset: assetSchema.optional(),
    binary: binarySchema.optional(),
    docker: dockerSchema.optional(),
    runEnv: runEnvironmentSchema.optional(),
    local: localSchema.optional(),
  })
  .refine(
    (data) =>
      util.toInt(data.runEnv)
      + util.toInt(data.binary || data.docker) // allow both docker and binary to be set in single entrypoint
      + util.toInt(data.asset)
      + util.toInt(data.local)
      == 1,
    {
      message:
        'entrypoint cannot point to several packages at once: choose \'environment\', \'binary\', \'asset\' or \'local\'',
      path: ['environment | binary | asset | local'],
    },
  );
export type entrypointSwJson = z.infer<typeof swJsonSchema> & {
  id: util.artifactID;
};

export function readSwJsonFile(
  npmPackageName: string,
  packageRoot: string,
  entrypointName: string,
): entrypointSwJson {
  const filePath = descriptorFilePath(packageRoot, 'software', entrypointName);
  return readDescriptorFile(npmPackageName, entrypointName, filePath);
}

export function readDescriptorFile(
  npmPackageName: string,
  entrypointName: string,
  filePath: string,
): entrypointSwJson {
  try {
    if (!fs.existsSync(filePath)) {
      throw util.CLIError(`entrypoint '${entrypointName}' not found in '${filePath}'`);
    }

    const swJsonContent = fs.readFileSync(filePath);
    const swJson = swJsonSchema.parse(JSON.parse(swJsonContent.toString()));

    return {
      id: {
        package: npmPackageName,
        name: entrypointName,
      },
      ...swJson,
    };
  } catch (e) {
    if (e instanceof ZodError) {
      const errLines: string[] = [`Failed to read and parse entrypoint '${entrypointName}' from '${filePath}':`];
      errLines.push(...(util.formatZodError(e).map((line) => `  ${line}`)));
      throw util.CLIError(errLines.join('\n'));
    }

    throw e;
  }
}

const softwareFileExtension = '.sw.json';
const assetFileExtension = '.as.json';

export function listPackageEntrypoints(packageRoot: string): { name: string; path: string }[] {
  const entrypoints = [];

  const swDir = descriptorFilePath(packageRoot, 'software');
  if (fs.existsSync(swDir)) {
    const swItems = fs.readdirSync(swDir);
    const swEntrypoints: { name: string; path: string }[] = swItems
      .filter((fName: string) => fName.endsWith(softwareFileExtension))
      .map((fName: string) => ({
        name: fName.slice(0, -softwareFileExtension.length),
        path: path.join(swDir, fName),
      }));

    entrypoints.push(...swEntrypoints);
  }

  const assetDir = descriptorFilePath(packageRoot, 'asset');
  if (fs.existsSync(assetDir)) {
    const assetItems = fs.readdirSync(assetDir);
    const assetEntrypoints = assetItems
      .filter((fName: string) => fName.endsWith(assetFileExtension))
      .map((fName: string) => ({
        name: fName.slice(0, -assetFileExtension.length),
        path: path.join(swDir, fName),
      }));

    entrypoints.push(...assetEntrypoints);
  }

  entrypoints.sort();

  for (let i = 0; i < entrypoints.length - 1; i++) {
    if (entrypoints[i].name === entrypoints[i + 1].name) {
      throw util.CLIError(
        `duplicate entrypoint name found between software and assets: '${entrypoints[i].name}'`,
      );
    }
  }

  return entrypoints;
}

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
  ): Map<string, entrypointSwJson> {
    const result = new Map<string, entrypointSwJson>();
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

  public writeEntrypointDescriptor(info: entrypointSwJson, dstFile?: string) {
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
  ): localInfo {
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
              runEnv: this.resolveRunEnvironment(pkg.environment, pkg.type),
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
              runEnv: this.resolveRunEnvironment(pkg.environment, pkg.type),
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
              runEnv: this.resolveRunEnvironment(pkg.environment, pkg.type),
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
  ): binaryInfo | undefined {
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
              runEnv: this.resolveRunEnvironment(binPkg.environment, binPkg.type),
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
              runEnv: this.resolveRunEnvironment(binPkg.environment, binPkg.type),
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
              runEnv: this.resolveRunEnvironment(binPkg.environment, binPkg.type),
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
  ): runEnvInfo | undefined {
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

  private renderAssetInfo(mode: util.BuildMode, epName: string, ep: PackageEntrypoint, requireArtifactInfo?: boolean): assetInfo | undefined {
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

  private renderDockerInfo(epName: string, ep: PackageEntrypoint, requireArtifactInfo?: boolean): dockerInfo | undefined {
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

  private resolveDependency(npmPackageName: string, entrypointName: string): entrypointSwJson {
    const modulePath = util.findInstalledModule(this.logger, npmPackageName, this.pkgInfo.packageRoot);
    return readSwJsonFile(npmPackageName, modulePath, entrypointName);
  }

  private resolveRunEnvironment(envName: string, requireType: 'java'): runEnvDependencyJava;
  private resolveRunEnvironment(envName: string, requireType: 'python'): runEncDependencyPython;
  private resolveRunEnvironment(envName: string, requireType: 'R'): runEnvDependencyR;
  private resolveRunEnvironment(
    envName: string,
    requireType: artifacts.runEnvironmentType,
  ): runEnvDependencyInfo {
    const [pkgName, id] = util.rSplit(envName, ':', 2);
    const swDescriptor
      = pkgName === ''
        ? readSwJsonFile(this.pkgInfo.packageName, this.pkgInfo.packageRoot, id)
        : this.resolveDependency(pkgName, id);

    if (!swDescriptor.runEnv) {
      throw util.CLIError(
        `software '${envName}' cannot be used as run environment (no 'runEnv' section in entrypoint descriptor)`,
      );
    }

    const runEnv = swDescriptor.runEnv;

    if (runEnv.type !== requireType) {
      this.logger.error(
        `run environment '${envName}' type '${runEnv.type}' differs from declared package type '${requireType}'`,
      );
      throw util.CLIError(
        `incompatible environment: env type '${runEnv.type}' != package type '${requireType}'`,
      );
    }

    switch (runEnv.type) {
      case 'python': {
        return {
          name: envName,
          ...runEnv,

          type: 'python',
          ['python-version']: runEnv['python-version'] ?? '',
        };
      }
      case 'R': {
        return {
          name: envName,
          ...runEnv,

          type: 'R',
          ['r-version']: runEnv['r-version'] ?? '',
        };
      }
      case 'java': {
        return {
          name: envName,
          ...runEnv,

          type: 'java',
          ['java-version']: runEnv['java-version'] ?? '',
        };
      }
      default:
        util.assertNever(runEnv.type);
        throw new Error('renderer logic error: resolveRunEnvironment does not cover all run environment types'); // calm down the linter
    }
  }
}

export const compiledSoftwareSuffix = '.sw.json';
export const compiledAssetSuffix = '.as.json';

export function descriptorFilePath(
  packageRoot: string,
  entrypointType: Extract<EntrypointType, 'software' | 'asset'>,
  entrypointName?: string,
): string {
  const typeSuffix = entrypointType === 'software' ? compiledSoftwareSuffix : compiledAssetSuffix;

  if (!entrypointName) {
    return path.resolve(packageRoot, 'dist', 'tengo', entrypointType);
  }

  return path.resolve(
    packageRoot,
    'dist',
    'tengo',
    entrypointType,
    `${entrypointName}${typeSuffix}`,
  );
}

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

export function validateDockerDescriptor(dockerDescriptor: dockerInfo | undefined): void {
  if (!dockerDescriptor?.cmd?.length) {
    return;
  }

  const isPkgRequired = dockerDescriptor.cmd.some((cmd) => cmd.includes('{pkg}'));
  if (isPkgRequired && !dockerDescriptor.pkg) {
    throw util.CLIError(`docker descriptor is invalid: 'pkg' is required when 'cmd' contains '{pkg}'`);
  }
}
