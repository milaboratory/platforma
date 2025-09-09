import { spawnSync } from 'node:child_process';
import type { DockerPackage } from './package-info';
import * as util from './util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export const defaultDockerRegistry = 'containers.pl-open.science/milaboratories/pl-containers';

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
    throw new Error(`local docker image check failed with status ${result.status}`);
  }

  const output = result.stdout.toString().trim();
  if (output.split('\n').length > 1) {
    throw new Error(`package-builder internal logic error: more than one image found by exact tag match: ${output}`);
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
    throw new Error(`docker push failed with status ${result.status}`);
  }
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
    throw new Error(`docker build failed with status ${result.status}`);
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
    throw new Error(`docker build failed with status ${result.status}`);
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
    throw new Error(`docker build failed with status ${result.status}`);
  }
}

export function generateRemoteTagName(pkg: DockerPackage, imageID: string, registry?: string): string {
  if (pkg.type !== 'docker') {
    throw new Error(`package '${pkg.name}' is not a docker package`);
  }

  return dockerTag(pkg.name, imageID, registry);
}

export function generateLocalTagName(packageRoot: string, pkg: DockerPackage): string {
  if (pkg.type !== 'docker') {
    throw new Error(`package '${pkg.name}' is not a docker package`);
  }

  const dockerfile = dockerfileFullPath(packageRoot, pkg);
  const context = contextFullPath(packageRoot, pkg);
  const hash = contentHash(context, dockerfile);

  return dockerTag('local-image', hash);
}

function dockerfileFullPath(packageRoot: string, pkg: DockerPackage): string {
  return path.resolve(packageRoot, pkg.dockerfile ?? 'Dockerfile');
}

function contextFullPath(packageRoot: string, pkg: DockerPackage): string {
  if (pkg.context === './' || pkg.context === '.') {
    throw new Error(`Invalid Docker context: "${pkg.context}". Context cannot be "./" or "." - use absolute path or relative path without "./" prefix`);
  }
  return path.resolve(packageRoot, pkg.context ?? '.');
}

function contentHash(contextFullPath: string, dockerfileFullPath: string): string {
  if (!fs.existsSync(dockerfileFullPath)) {
    throw new Error(`Dockerfile '${dockerfileFullPath}' not found`);
  }

  if (!fs.existsSync(contextFullPath)) {
    throw new Error(`Context '${contextFullPath}' not found`);
  }

  const contextHash = util.hashDirMetaSync(contextFullPath);
  const dockerfileContent = fs.readFileSync(dockerfileFullPath, 'utf8');
  contextHash.update(dockerfileContent);

  return contextHash.digest('hex').slice(0, 12);
}

function dockerTag(packageName: string, contentHash: string, registry?: string): string {
  const dockerRegistry = registry ?? defaultDockerRegistry;
  return `${dockerRegistry}:${packageName.replaceAll('/', '.')}.${contentHash}`;
}
