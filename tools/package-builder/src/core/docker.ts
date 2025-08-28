import { spawnSync } from 'node:child_process';
import type { DockerPackage } from './package-info';
import * as os from 'node:os';
import { PL_DOCKER_REGISTRY } from './envs';

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

export function getImageID(tag: string): string {
  const result = spawnSync('docker', ['image', 'ls', '--filter=reference=' + tag, '--format={{.ID}}'], {
    stdio: 'pipe',
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
  return getImageID(tag) !== '';
}

export function remoteImageExists(tag: string): boolean {
  const result = spawnSync('docker', ['manifest', 'inspect', tag], {
    stdio: 'pipe',
    env: {
      ...process.env, // Inherit all environment variables from the parent process
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
      ...process.env, // Inherit all environment variables from the parent process
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

export function build(context: string, dockerfile: string, tag: string) {
  const result = spawnSync('docker', ['build', '-t', tag, context, '-f', dockerfile], {
    stdio: 'inherit',
    env: {
      ...process.env, // Inherit all environment variables from the parent process
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
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`docker build failed with status ${result.status}`);
  }
}

export function generateDstTagName(pkg: DockerPackage, imageID: string): string {
  if (pkg.type !== 'docker') {
    throw new Error(`package '${pkg.name}' is not a docker package`);
  }

  const dockerRegistry = process.env[PL_DOCKER_REGISTRY] ?? defaultDockerRegistry;
  return `${dockerRegistry}:${pkg.name.replaceAll('/', '.')}.${imageID}`;
}
