/** Just a lot of hardcoded paths of our current ssh deployment. */

import upath from 'upath';
import { newArch } from '../common/os_and_arch';
import { getDefaultPlVersion } from '../common/pl_version';

export const minioDirName = 'minio-2024-12-18T13-15-44Z';
export const supervisordDirName = 'supervisord-0.7.3';
export const supervisordSubDirName = 'supervisord_0.7.3_Linux_64-bit';

export function workDir(remoteHome: string) {
  return upath.join(remoteHome, '.platforma_ssh');
}

export function binariesDir(remoteHome: string) {
  return upath.join(workDir(remoteHome), 'binaries');
}

export function platformaBaseDir(remoteHome: string, arch: string) {
  return upath.join(binariesDir(remoteHome), `pl-${getDefaultPlVersion()}-${newArch(arch)}`);
}

export function platformaDir(remoteHome: string, arch: string) {
  return upath.join(platformaBaseDir(remoteHome, arch), 'binaries');
}

export function platformaBin(remoteHome: string, arch: string): string {
  return upath.join(platformaDir(remoteHome, arch), 'platforma');
}

export function platformaConf(remoteHome: string): string {
  return upath.join(workDir(remoteHome), 'config.yaml');
}

export function platformaFreePortBin(remoteHome: string, arch: string): string {
  return upath.join(platformaDir(remoteHome, arch), 'free-port');
}

export function minioDir(remoteHome: string, arch: string) {
  return upath.join(binariesDir(remoteHome), `minio-2024-12-18T13-15-44Z-${newArch(arch)}`);
}

export function minioBin(remoteHome: string, arch: string) {
  return upath.join(minioDir(remoteHome, arch), 'minio');
}

export function supervisorBinDir(remoteHome: string, arch: string) {
  return upath.join(binariesDir(remoteHome), `supervisord-0.7.3-${newArch(arch)}`, supervisordSubDirName);
}

export function supervisorBin(remoteHome: string, arch: string): string {
  return upath.join(supervisorBinDir(remoteHome, arch), 'supervisord');
}

export function supervisorConf(remoteHome: string) {
  return upath.join(workDir(remoteHome), 'supervisor.conf');
}

export function connectionInfo(remoteHome: string) {
  return upath.join(workDir(remoteHome), `connection.txt`);
}
