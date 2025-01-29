/** Just a lot of hardcoded paths of our current ssh deployment. */

import upath from 'upath';
import { newArch } from '../common/os_and_arch';
import { getDefaultPlVersion } from '../common/pl_version';

export const minioDirName = 'minio-2024-12-18T13-15-44Z';
export const supervisordDirName = 'supervisord-0.7.3';
export const supervisordSubDirName = 'supervisord_0.7.3_Linux_64-bit';

export function binariesDir(home: string) {
  return upath.join(home, 'platforma_ssh', 'binaries');
}

export function platformaBaseDir(arch: string) {
  return `pl-${getDefaultPlVersion()}-${newArch(arch)}`;
}

export function platformaDir(remoteHome: string, arch: string) {
  return upath.join(binariesDir(remoteHome), platformaBaseDir(arch), 'binaries');
}

export function minioDir(remoteHome: string, arch: string) {
  return upath.join(binariesDir(remoteHome), `minio-2024-12-18T13-15-44Z-${newArch(arch)}`);
}

export function getPlatformaRemoteWorkingDir(remoteHome: string) {
  return upath.join(remoteHome, 'platforma_ssh');
}

export function getSupervisorBinDirOnServer(remoteHome: string, arch: string) {
  return upath.join(binariesDir(remoteHome), `supervisord-0.7.3-${newArch(arch)}`, supervisordSubDirName);
}

export function getSupervisorConfOnServer(remoteHome: string) {
  return upath.join(getPlatformaRemoteWorkingDir(remoteHome), 'supervisor.conf');
}

export function getConnectionFilePath(remoteHome: string) {
  return upath.join(getPlatformaRemoteWorkingDir(remoteHome), `connection.txt`);
}

