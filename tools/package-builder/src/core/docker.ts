import { DockerPackage } from "./package-info";
import * as util from './util';
import * as fs from 'fs';

const defaultDockerRegistry = 'quora.io';

export function contentHash(contextFullPath: string, dockerfileFullPath: string): string {
  const contextHash = util.hashDirMetaSync(contextFullPath);
  const statInfo = fs.statSync(dockerfileFullPath);
  const fileInfo = `${dockerfileFullPath}:${statInfo.size}:${statInfo.mtimeMs}`;
  contextHash.update(fileInfo);

  return contextHash.digest('hex').slice(0, 8);
}

export function dockerTag(packageName: string, pkgID: string, version: string, contentHash: string): string {
  const dockerRegistry = process.env.PL_DOCKER_REGISTRY ?? defaultDockerRegistry;
  return `${dockerRegistry}/${packageName}.${pkgID}.${contentHash}:${version}`;
}
