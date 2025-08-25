import path from 'node:path';
import fs from 'node:fs';
import type winston from 'winston';
import { z } from 'zod';
import type { Entrypoint, EntrypointType, PackageEntrypoint } from './package-info';
import * as artifacts from './schemas/artifacts';
import * as util from './util';
import { dockerEntrypointNameToOrigin, dockerTagFromPackage } from './docker';

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
  binDir: z.string(),
});
type runEnvInfo = z.infer<typeof runEnvironmentSchema>;

const runDependencyJavaSchema = runEnvironmentSchema.extend({
  type: z.literal('java'),
  name: z
    .string()
    .describe('name used to import this package as software dependency of tengo script'),
});
type runDependencyJava = z.infer<typeof runDependencyJavaSchema>;

const runDependencyPythonSchema = runEnvironmentSchema.extend({
  type: z.literal('python'),
  name: z
    .string()
    .describe('name used to import this package as software dependency of tengo script'),
});
type runDependencyPython = z.infer<typeof runDependencyPythonSchema>;

const runDependencyRSchema = runEnvironmentSchema.extend({
  type: z.literal('R'),
  name: z
    .string()
    .describe('name used to import this package as software dependency of tengo script'),
});
type runDependencyR = z.infer<typeof runDependencyRSchema>;

const runDependencyCondaSchema = runEnvironmentSchema.extend({
  type: z.literal('conda'),
  name: z
    .string()
    .describe('name used to import this package as software dependency of tengo script'),
});
type runDependencyConda = z.infer<typeof runDependencyCondaSchema>;

type runDepInfo = runDependencyJava | runDependencyPython | runDependencyR | runDependencyConda;
// runDependencyConda

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
  workdir: z.string().optional().describe('custom working directory in Docker container (default: /app)'),
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

const entrypointSchema = z
  .object({
    isDev: z.boolean().optional(),

    asset: assetSchema.optional(),
    binary: binarySchema.optional(),
    runEnv: runEnvironmentSchema.optional(),
    local: localSchema.optional(),
    docker: dockerSchema.optional(),
  })
  .refine(
    (data) =>
      util.toInt(data.runEnv)
      + util.toInt(data.binary)
      + util.toInt(data.asset)
      + util.toInt(data.local)
      == 1,
    {
      message:
        'entrypoint cannot point to several packages at once: choose \'environment\', \'binary\', \'asset\' or \'local\'',
      path: ['environment | binary | asset | local'],
    },
  );
export type entrypointSwJson = z.infer<typeof entrypointSchema> & {
  id: util.artifactID;
};

export function readSoftwareEntrypoint(
  npmPackageName: string,
  packageRoot: string,
  entrypointName: string,
): entrypointSwJson {
  const filePath = entrypointFilePath(packageRoot, 'software', entrypointName);
  return readEntrypointDescriptor(npmPackageName, entrypointName, filePath);
}

export function readEntrypointDescriptor(
  npmPackageName: string,
  entrypointName: string,
  filePath: string,
): entrypointSwJson {
  if (!fs.existsSync(filePath)) {
    throw new Error(`entrypoint '${entrypointName}' not found in '${filePath}'`);
  }

  const swJsonContent = fs.readFileSync(filePath);
  const swJson = entrypointSchema.parse(JSON.parse(swJsonContent.toString()));

  return {
    id: {
      package: npmPackageName,
      name: entrypointName,
    },
    ...swJson,
  };
}

const softwareFileExtension = '.sw.json';
const assetFileExtension = '.as.json';

export function listPackageEntrypoints(packageRoot: string): { name: string; path: string }[] {
  const entrypoints = [];

  const swDir = entrypointFilePath(packageRoot, 'software');
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

  const assetDir = entrypointFilePath(packageRoot, 'asset');
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
      throw new Error(
        `duplicate entrypoint name found between software and assets: '${entrypoints[i].name}'`,
      );
    }
  }

  return entrypoints;
}

export class Renderer {
  constructor(
    private logger: winston.Logger,
    private npmPackageName: string,
    private npmPackageRoot: string,
  ) {}

  public renderSoftwareEntrypoints(
    mode: util.BuildMode,
    entrypoints: Map<string, Entrypoint>,
    options?: {
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

      // In docker case we should merge docker info and other info
      //
      const originEpName = dockerEntrypointNameToOrigin(epName);
      const info = result.has(originEpName)
        ? result.get(originEpName)
        : {
            id: {
              package: this.npmPackageName,
              name: originEpName,
            },
          };
      if (!info) {
        throw new Error(`Entrypoint ${epName} not found in result`);
      }

      if (mode !== 'release') {
        info.isDev = true;
      }

      const pkg = ep.package;
      if (mode === 'dev-local') {
        switch (pkg.type) {
          case 'docker':
            info.docker = this.renderDockerInfo(epName, ep);
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
          info.binary = this.renderBinaryInfo(mode, epName, ep);
          break;
        case 'environment':
          info.runEnv = this.renderRunEnvInfo(mode, epName, ep);
          break;
        case 'asset':
          info.asset = this.renderAssetInfo(mode, epName, ep);
          break;
        case 'binary':
          info.binary = this.renderBinaryInfo(mode, epName, ep);
          break;
        case 'docker':
          info.docker = this.renderDockerInfo(epName, ep);
          break;
        case 'java':
          info.binary = this.renderBinaryInfo(mode, epName, ep);
          break;
        case 'python':
          info.binary = this.renderBinaryInfo(mode, epName, ep);
          break;
        default:
          util.assertNever(type);
          throw new Error(`renderer logic error: renderSoftwareEntrypoints does not cover all package types`);
      }

      result.set(originEpName, info);
    }

    if (result.size === 0 && !hasReferences) {
      this.logger.error('no entrypoint descriptors were rendered');
      throw new Error('no entrypoint descriptors were rendered');
    }

    return result;
  }

  public writeEntrypointDescriptor(info: entrypointSwJson, dstFile?: string) {
    const epType = info.asset ? 'asset' : 'software';
    const dstSwInfoPath = dstFile ?? entrypointFilePath(this.npmPackageRoot, epType, info.id.name);

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
      throw new Error(
        `unknown entrypoint '${epName}' type: cannot get type from extension of source file ${srcFile}`,
      );
    }

    const dstSwInfoPath = entrypointFilePath(this.npmPackageRoot, epType, epName);
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
        throw new Error(
          `entrypoint ${epName} points to 'environment' artifact, which does not support local build yet`,
        );

      case 'asset':
        throw new Error(
          `entrypoint ${epName} points to 'asset' artifact, which does not support local build yet`,
        );

      case 'software':{
        const pkgType = pkg.type;
        switch (pkgType) {
          case 'environment':{
            throw new Error(
              `entrypoint is incompatible with artifact type: ep=${epName} (software), artifact='${pkgType}'`,
            );
          }
          case 'asset':{
            throw new Error(
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
            throw new Error(
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
  ): binaryInfo {
    switch (mode) {
      case 'release':
        break;

      case 'dev-local':
        throw new Error(`'*.sw.json' generator logic error`);

      default:
        util.assertNever(mode);
    }

    const pkg = ep.package;

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
        const pkgType = pkg.type;
        switch (pkgType) {
          case 'asset':{
            throw new Error(
              `entripoint is incompatible with artifact type: ep=${epName} (software), artifact='${pkgType}'`,
            );
          }
          case 'environment':{
            throw new Error(
              `entripoint is incompatible with artifact type: ep=${epName} (software), artifact='${pkgType}'`,
            );
          }
          case 'docker': {
            throw new Error(
              `entrypoint is incompatible with artifact type: ep=${epName} (software), artifact='${pkgType}'`,
            );
          }
          case 'binary':{
            // Regular binary with no run environment dependency
            return {
              type: 'binary',
              registry: pkg.registry.name,
              package: pkg.namePattern,

              cmd: ep.cmd,
              envVars: ep.env,
            };
          }
          case 'java':{
            return {
              type: 'java',
              registry: pkg.registry.name,
              package: pkg.namePattern,

              cmd: ep.cmd,
              envVars: ep.env,
              runEnv: this.resolveRunEnvironment(pkg.environment, pkg.type),
            };
          }
          case 'python': {
            const { toolset, ...deps } = pkg.dependencies ?? {};

            return {
              type: 'python',
              registry: pkg.registry.name,
              package: pkg.namePattern,

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
              registry: pkg.registry.name,
              package: pkg.namePattern,

              cmd: ep.cmd,
              envVars: ep.env,
              runEnv: this.resolveRunEnvironment(pkg.environment, pkg.type),
              toolset: 'renv',
              dependencies: {},
            };
          }
          // case "conda":
          //     if (runEnv!.type !== pkgType) {
          //         this.logger.error(`run environment '${binary.environment}' type '${runEnv!.type}' differs from declared package type '${binary.type}'`)
          //         throw new Error(`incompatible environment: env type '${runEnv!.type}' != package type '${binary.type}'`)
          //     }
          //     return {
          //         type: "conda",
          //         registry: binary.registry.name!,
          //         package: binary.namePattern,

          //         cmd: ep.cmd,
          //         envVars: ep.envVars,
          //         runEnv: runEnv!,
          //     }
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
  ): runEnvInfo {
    switch (mode) {
      case 'release':
        break;

      case 'dev-local':
        throw new Error(`run environments do not support 'local' dev build mode yet`);

      default:
        util.assertNever(mode);
    }

    const env = ep.package;

    if (env.type !== 'environment') {
      throw new Error(
        `could not render run environemnt entrypoint ${epName} (not 'environment' artifact)`,
      );
    }

    return {
      type: env.runtime,
      registry: env.registry.name,
      package: env.namePattern,
      binDir: env.binDir,
    };
  }

  private renderAssetInfo(mode: util.BuildMode, epName: string, ep: PackageEntrypoint): assetInfo {
    switch (mode) {
      case 'release':
        break;

      case 'dev-local':
        throw new Error(`assets do not support 'local' dev build mode yet`);

      default:
        util.assertNever(mode);
    }

    const pkg = ep.package;

    if (pkg.type !== 'asset') {
      throw new Error(`could not render asset entrypoint '${epName}': not 'asset' artifact`);
    }

    if (!pkg.registry.downloadURL) {
      throw new Error(
        `could not render asset entrypoint '${epName}': base download URL is not configured for asset's registry`,
      );
    }

    return {
      registry: pkg.registry.name,
      package: pkg.namePattern,
      url: util.urlJoin(pkg.registry.downloadURL, pkg.namePattern),
    };
  }

  private renderDockerInfo(entrypointName: string, ep: PackageEntrypoint): dockerInfo {
    const pkg = ep.package;
    if (pkg.type !== 'docker') {
      throw new Error(`could not render docker entrypoint '${entrypointName}': not 'docker' artifact`);
    }

    if (ep.type !== 'software') {
      throw new Error(`could not render docker entrypoint '${entrypointName}': not 'software' artifact`);
    }

    const blockName = this.npmPackageName.split('/').pop() ?? '';
    if (blockName === '') {
      throw new Error(`could not render docker entrypoint '${entrypointName}': could not determine block name from npm package name '${this.npmPackageName}'`);
    }

    const tag = dockerTagFromPackage(this.npmPackageRoot, pkg);

    return {
      tag: tag,
      entrypoint: pkg.entrypoint ?? [],
      cmd: ep.cmd,
      pkg: pkg.pkg,
    };
  }

  private resolveDependency(npmPackageName: string, entrypointName: string): entrypointSwJson {
    const modulePath = util.findInstalledModule(this.logger, npmPackageName, this.npmPackageRoot);
    return readSoftwareEntrypoint(npmPackageName, modulePath, entrypointName);
  }

  private resolveRunEnvironment(envName: string, requireType: 'java'): runDependencyJava;
  private resolveRunEnvironment(envName: string, requireType: 'python'): runDependencyPython;
  private resolveRunEnvironment(envName: string, requireType: 'R'): runDependencyR;
  private resolveRunEnvironment(
    envName: string,
    requireType: artifacts.runEnvironmentType,
  ): runDepInfo {
    const [pkgName, id] = util.rSplit(envName, ':', 2);
    const swDescriptor
      = pkgName === ''
        ? readSoftwareEntrypoint(this.npmPackageName, this.npmPackageRoot, id)
        : this.resolveDependency(pkgName, id);

    if (!swDescriptor.runEnv) {
      throw new Error(
        `software '${envName}' cannot be used as run environment (no 'runEnv' section in entrypoint descriptor)`,
      );
    }

    const runEnv = swDescriptor.runEnv;

    if (runEnv.type !== requireType) {
      this.logger.error(
        `run environment '${envName}' type '${runEnv.type}' differs from declared package type '${requireType}'`,
      );
      throw new Error(
        `incompatible environment: env type '${runEnv.type}' != package type '${requireType}'`,
      );
    }

    return {
      name: envName,

      type: runEnv.type,
      registry: runEnv.registry,
      package: runEnv.package,
      binDir: runEnv.binDir,
    };
  }
}

export const compiledSoftwareSuffix = '.sw.json';
export const compiledAssetSuffix = '.as.json';

export function entrypointFilePath(
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
