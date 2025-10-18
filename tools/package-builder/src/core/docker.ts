import { spawnSync } from 'node:child_process';
import * as defaults from '../defaults';
import type * as artifacts from './schemas/artifacts';
import * as util from './util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export function entrypointName(name: string): string {
  return name + ':docker';
}

export function entrypointNameToOrigin(name: string): string {
  const suffixIndex = name.indexOf(':docker');
  if (suffixIndex === -1) {
    return name;
  }
  return name.substring(0, suffixIndex);
}

export function getImageHash(tag: string): string {
  const result = spawnSync('docker', ['image', 'ls', '--filter=reference=' + tag, '--format={{.ID}}'], {
    stdio: 'pipe',
    env: {
      ...process.env, // PATH variable from parent process affects execution
      HOME: process.env.HOME || os.homedir(), // Ensure HOME is set
    },
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw util.CLIError(`local docker image check failed with status ${result.status}`);
  }

  const output = result.stdout.toString().trim();
  if (output.split('\n').length > 1) {
    throw util.CLIError(`package-builder internal logic error: more than one image found by exact tag match: ${output}`);
  }

  return output;
}

export function localImageExists(tag: string): boolean {
  return getImageHash(tag) !== '';
}

export function remoteImageExists(tag: string): boolean {
  const result = spawnSync('docker', ['manifest', 'inspect', tag], {
    stdio: 'pipe',
    env: {
      ...process.env, // PATH variable from parent process affects execution
      HOME: process.env.HOME || os.homedir(), // Ensure HOME is set
    },
  });

  if (result.error || result.status !== 0) {
    return false;
  }

  return true;
}

export function build(context: string, dockerfile: string, tag: string, softwarePackage: string, softwareVersion: string | undefined) {
  const result = spawnSync('docker', [
    'build', '-t', tag, context, '-f', dockerfile,
    '--label', 'com.milaboratories.package-builder.software=true',
    '--label', 'com.milaboratories.package-builder.software.package=' + softwarePackage,
    '--label', 'com.milaboratories.package-builder.software.version=' + softwareVersion,
  ], {
    stdio: 'inherit',
    env: {
      ...process.env, // PATH variable from parent process affects execution
      HOME: process.env.HOME || os.homedir(), // Ensure HOME is set
    },
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw util.CLIError(`'docker build' failed with status ${result.status}`);
  }
}

export function push(tag: string) {
  const result = spawnSync('docker', ['push', tag], {
    stdio: 'inherit',
    env: {
      ...process.env, // PATH variable from parent process affects execution
      HOME: process.env.HOME || os.homedir(), // Ensure HOME is set
    },
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw util.CLIError(`'docker push' failed with status ${result.status}`);
  }
}

export function addTag(imageIdOrTag: string, newTag: string) {
  const result = spawnSync('docker', ['image', 'tag', imageIdOrTag, newTag], {
    stdio: 'inherit',
    env: {
      ...process.env, // PATH variable from parent process affects execution
      HOME: process.env.HOME || os.homedir(), // Ensure HOME is set
    },
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw util.CLIError(`'docker tag' failed with status ${result.status}`);
  }
}

export function removeTag(imageTag: string) {
  const result = spawnSync('docker', ['image', 'rm', imageTag], {
    stdio: 'inherit',
    env: {
      ...process.env, // PATH variable from parent process affects execution
      HOME: process.env.HOME || os.homedir(), // Ensure HOME is set
    },
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw util.CLIError(`'docker image rm' failed with status ${result.status}`);
  }
}

/**
 * Generate unique content-addressable image tag
 * @param artifactName: artifact name generated from package name and artifact ID (or explicitly set for artifact in .name field)
 * @param imageID: unique image content hash (docker image ID in docker ls)
 * @param registry: custom registry and repository to use for this image
 * @returns full image tag in format: <registry>/repository:<artifactName>.<imageID>
 */
export function generateRemoteTagName(artifactName: string, imageID: string, registry?: string): string {
  return dockerTag(artifactName, imageID, registry);
}

/**
 * Generate unique content-addressable image tag out of directories and Dockerfile.
 * @param packageRoot: package root path from where to resolve artifact's paths (context, Dockerfile, ...)
 * @param artifact: docker artifact configuration
 * @returns full image tag in format: <registry>/repository:<artifactName>.<contentHash>
 */
export function generateLocalTagName(packageRoot: string, artifact: artifacts.dockerType): string {
  const dockerfile = dockerfileAbsPath(packageRoot, artifact);
  const context = contextAbsPath(packageRoot, artifact);
  const hash = contentHash(context, dockerfile);

  return dockerTag('local-image', hash);
}

/**
 * Resolve path to Dockerfile.
 * @param packageRoot: package root path from where to resolve artifact's paths (context, Dockerfile, ...)
 * @param artifact: docker artifact configuration
 * @returns absolute path to Dockerfile
 */
function dockerfileAbsPath(packageRoot: string, artifact: artifacts.dockerType): string {
  return path.resolve(packageRoot, artifact.dockerfile ?? 'Dockerfile');
}

/**
 * Resolve path to docker build context directory.
 * @param packageRoot: package root path from where to resolve artifact's paths (context, Dockerfile, ...)
 * @param artifact: docker artifact configuration
 * @returns absolute path to docker build context directory
 */
function contextAbsPath(packageRoot: string, artifact: artifacts.dockerType): string {
  if (artifact.context === './' || artifact.context === '.') {
    throw util.CLIError(`Invalid Docker context: "${artifact.context}". Context cannot be "./" or "." - use absolute path or relative path without "./" prefix`);
  }
  return path.resolve(packageRoot, artifact.context ?? '.');
}

/**
 * Calculate cummulative hash of docker build context directory context and Dockerfile.
 * To speedup hash calculation, we do not read contents of each item in context dir but
 * use metadata (size, mtime, ...).
 *
 * @param contextFullPath: abs path to docker build context
 * @param dockerfileFullPath: abs path to Dockerfile
 * @returns hash of what the keep
 */
function contentHash(contextFullPath: string, dockerfileFullPath: string): string {
  if (!fs.existsSync(dockerfileFullPath)) {
    throw util.CLIError(`Dockerfile '${dockerfileFullPath}' not found`);
  }

  if (!fs.existsSync(contextFullPath)) {
    throw util.CLIError(`Context '${contextFullPath}' not found`);
  }

  const contextHash = util.hashDirMetaSync(contextFullPath);
  const dockerfileContent = fs.readFileSync(dockerfileFullPath, 'utf8');
  contextHash.update(dockerfileContent);

  return contextHash.digest('hex').slice(0, 12);
}

function dockerTag(packageName: string, contentHash: string, registry?: string): string {
  const dockerRegistry = registry ?? defaults.DOCKER_REGISTRY;
  return `${dockerRegistry}:${packageName.replaceAll('/', '.')}.${contentHash}`;
}
