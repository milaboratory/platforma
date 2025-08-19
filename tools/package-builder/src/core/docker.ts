import { spawnSync } from 'node:child_process';
import type { DockerPackage } from './package-info';
import * as util from './util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { PL_DOCKER_REGISTRY } from './envs';

export const defaultDockerRegistry = 'containers.pl-open.science/milaboratories/pl-containers';

export function dockerEntrypointName(name: string): string {
  return name + ':docker';
}

export function dockerEntrypointNameToOrigin(name: string): string {
  const suffixIndex = name.indexOf(':docker');
  if (suffixIndex === -1) {
    return name;
  }
  return name.substring(0, suffixIndex);
}

export function dockerPush(tag: string) {
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

export function dockerBuild(context: string, dockerfile: string, tag: string) {
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

export function dockerTagFromPackage(packageRoot: string, pkg: DockerPackage): string {
  if (pkg.type !== 'docker') {
    throw new Error(`package '${pkg.name}' is not a docker package`);
  }
  const dockerfile = dockerfileFullPath(packageRoot, pkg);
  const context = contextFullPath(packageRoot, pkg);
  const hash = contentHash(context, dockerfile);
  const tag = dockerTag(pkg.name, hash);
  return tag;
}

export function dockerfileFullPath(packageRoot: string, pkg: DockerPackage): string {
  return path.resolve(packageRoot, pkg.dockerfile ?? 'Dockerfile');
}

export function contextFullPath(packageRoot: string, pkg: DockerPackage): string {
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
  const statInfo = fs.statSync(dockerfileFullPath);
  const fileInfo = `${dockerfileFullPath}:${statInfo.size}:${statInfo.mtimeMs}`;
  contextHash.update(fileInfo);

  return contextHash.digest('hex').slice(0, 12);
}

function dockerTag(packageName: string, contentHash: string): string {
  const dockerRegistry = process.env[PL_DOCKER_REGISTRY] ?? defaultDockerRegistry;
  return `${dockerRegistry}:${packageName.replaceAll('/', '.')}.${contentHash}`;
}
