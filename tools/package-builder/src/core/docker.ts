import { spawnSync } from "child_process";
import { DockerPackage, PackageConfig } from "./package-info";
import * as util from './util';
import * as fs from 'fs';
import * as path from 'path';
import { PL_DOCKER_REGISTRY } from "./envs";

export const defaultDockerRegistry = 'quora.io';

export function dockerPush(tag: string) {
  const result = spawnSync('docker', ['push', tag], { stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`docker push failed with status ${result.status}`);
  }
}

export function dockerBuild(context: string, dockerfile: string, tag: string) {
  const result = spawnSync('docker', ['build', '-t', tag, context, '-f', dockerfile], { stdio: 'inherit' });
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

function dockerfileFullPath(packageRoot: string, pkg: DockerPackage): string {
  return path.resolve(packageRoot, pkg.dockerfile ?? 'Dockerfile');
}

function contextFullPath(packageRoot: string, pkg: DockerPackage): string {
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
  return `${dockerRegistry}/${packageName}:${contentHash}`;
}
