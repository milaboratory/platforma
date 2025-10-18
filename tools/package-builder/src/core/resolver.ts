import path from 'node:path';
import fs from 'node:fs';
import type winston from 'winston';

import * as swJson from './schemas/sw-json';
import type * as artifacts from './schemas/artifacts';
import type * as entrypoint from './schemas/entrypoints';
import * as util from './util';

export const compiledSoftwareSuffix = '.sw.json';
export const compiledAssetSuffix = '.as.json';

export function descriptorFilePath(
  packageRoot: string,
  entrypointType: Extract<entrypoint.EntrypointType, 'software' | 'asset'>,
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

/**
 * Read and parse 'sw.json' descriptor file from given path.
 *
 * @param packageRoot: string - root directory of the package that contains software descriptor
 * @param packageName: string - name of the package from <packageRoot>/package.json
 * @param entrypointName: string - name of entrypoint with software descriptor
 *
 * @returns swJson.entrypoint - parsed descriptor with meta information of where it came from
 */
export function readSwJsonFile(
  packageRoot: string,
  packageName: string,
  entrypointName: string,
): swJson.entrypoint {
  const filePath = descriptorFilePath(packageRoot, 'software', entrypointName);
  return readDescriptorFile(packageName, entrypointName, filePath);
}

/**
 * Read 'sw.json' or 'as.json' descriptor file from given path and provide it along with metadata of where it came from
 *
 * @param packageNameForDescriptor: string - name of the package that contains this descriptor
 * @param entrypointForDescriptor: string - name of entrypoint that contains this descriptor inside given package
 * @param descriptorFilePath: string - path to the descriptor file
 * @returns swJson.entrypoint - parsed descriptor with meta information of where it came from
 */
export function readDescriptorFile(
  packageNameForDescriptor: string,
  entrypointForDescriptor: string,
  descriptorFilePath: string,
): swJson.entrypoint {
  if (!fs.existsSync(descriptorFilePath)) {
    throw util.CLIError(`entrypoint '${entrypointForDescriptor}' not found in '${descriptorFilePath}'`);
  }

  const swJsonContent = fs.readFileSync(descriptorFilePath);
  const result = swJson.entrypointSchema.safeParse(JSON.parse(swJsonContent.toString()));

  if (!result.success) {
    throw util.CLIError(util.formatZodIssues(result.error.issues));
  }

  return {
    id: {
      package: packageNameForDescriptor,
      name: entrypointForDescriptor,
    },
    ...result.data,
  };
}

/**
 * Resolve package dependency and read software descriptor from it.
 *
 * @param logger: winston.Logger - logger instance
 * @param currentPackageRoot: string - root directory of the current package
 * @param dependencyPackageName: string - name of the dependency to search
 * @param dependencyEntrypointName: string - name of the entrypooint inside dependency package
 *
 * @returns swJson.entrypoint - parsed descriptor with meta information of where it came from
 */
export function resolveDependency(
  logger: winston.Logger,
  currentPackageRoot: string,
  dependencyPackageName: string,
  dependencyEntrypointName: string,
): swJson.entrypoint {
  const dependencyPath = util.findInstalledModule(logger, dependencyPackageName, currentPackageRoot);
  return readSwJsonFile(dependencyPath, dependencyPackageName, dependencyEntrypointName);
}

export function resolveRunEnvironment(logger: winston.Logger, packageRoot: string, packageName: string, envName: string, requireType: 'java'): swJson.runEnvDependencyJava;
export function resolveRunEnvironment(logger: winston.Logger, packageRoot: string, packageName: string, envName: string, requireType: 'python'): swJson.runEnvDependencyPython;
export function resolveRunEnvironment(logger: winston.Logger, packageRoot: string, packageName: string, envName: string, requireType: 'R'): swJson.runEnvDependencyR;
export function resolveRunEnvironment(
  logger: winston.Logger,
  packageRoot: string,
  packageName: string,
  envName: string,
  requireType: artifacts.runEnvironmentType,
): swJson.runEnvDependency {
  const [pkgName, id] = util.rSplit(envName, ':', 2);
  const swDescriptor
      = pkgName === ''
        ? readSwJsonFile(packageRoot, packageName, id)
        : resolveDependency(logger, packageRoot, pkgName, id);

  if (!swDescriptor.runEnv) {
    throw util.CLIError(
      `software '${envName}' cannot be used as run environment (no 'runEnv' section in entrypoint descriptor)`,
    );
  }

  const runEnv = swDescriptor.runEnv;

  if (runEnv.type !== requireType) {
    logger.error(
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
