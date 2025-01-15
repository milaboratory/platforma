import { describe, it, beforeAll, expect, afterAll } from 'vitest';
import { initContainer, getConnectionForSsh } from './common-utils';
import { SshPl } from '../pl';
import path, { resolve } from 'path';
import { getDefaultPlVersion } from '../../common/pl_version';
import { existsSync, unlinkSync, rmSync } from 'fs';
import { newArch } from '../../common/os_and_arch';
import { downloadBinary } from '../../common/pl_binary_download';
import { ConsoleLoggerAdapter } from '@milaboratories/ts-helpers';

let sshPl: SshPl | null;

const downloadDestination = resolve(__dirname, '..', 'test-assets', 'downloads');

async function cleanUp() {
  const version = getDefaultPlVersion();
  const platformInfo = await sshPl?.getArch();
  const tgzName = 'supervisord-0.7.3';

  unlinkSync(`${downloadDestination}/pl-${version}-${newArch(platformInfo!.arch)}.tgz`);
  unlinkSync(`${downloadDestination}/${tgzName}-${newArch(platformInfo!.arch)}.tgz`);

  // rmSync(`${destination}/pl-${version}-${newArch(platformInfo!.arch)}`, { recursive: true, force: true });
  // rmSync(`${destination}/${tgzName}-${newArch(platformInfo!.arch)}`, { recursive: true, force: true });
}
beforeAll(async () => {
  await initContainer();
  sshPl = await SshPl.init(getConnectionForSsh());
});

afterAll(async () => {
  // await cleanUp();
});

describe('SshPl', async () => {
  it('Get OS arch', async () => {
    const platformInfo = await sshPl?.getArch();
    expect(platformInfo).toHaveProperty('platform');
    expect(platformInfo).toHaveProperty('arch');

    expect(platformInfo?.arch).toBe('x86_64');
    expect(platformInfo?.platform).toBe('Linux');
  });

  it('Download binaries', async () => {
    const path = await sshPl?.downloadPlatformaBinaries(resolve(__dirname, '..', 'test-assets', 'downloads'));
    expect(!!path).toBe(true);
  });

  // it('platformaInit', async () => {
  //   await sshPl?.platformaInit(downloadDestination);
  // });

  // it('Transfer Platforma to server', async () => {
  //   const plPath = await sshPl?.downloadPlatformaBinaries(downloadDestination);
  //   const dirPath = path.resolve(downloadDestination, path.basename(path.dirname(path.dirname(plPath!))));
  //   await sshPl?.sshClient.uploadDirectory(dirPath, '/home/pl-doctor/qqq');
  //   console.log(plPath, dirPath);
  // });
});

describe('SshPl download binaries', async () => {
  it('Doanload pl. We have archive and extracted data', async () => {
    const platformInfo = await sshPl?.getArch();
    const path = await sshPl?.downloadPlatformaBinaries(downloadDestination);
    const version = getDefaultPlVersion();
    expect(!!path).toBe(true);
    expect(existsSync(`${downloadDestination}/pl-${version}-${newArch(platformInfo!.arch)}.tgz`)).toBe(true);
  });

  it('Download other software', async () => {
    const platformInfo = await sshPl?.getArch();

    const softwareName = 'supervisord';
    const tgzName = 'supervisord-0.7.3';

    const path = await downloadBinary(new ConsoleLoggerAdapter(), downloadDestination, softwareName, tgzName, platformInfo!.arch, platformInfo!.platform);

    expect(!!path).toBe(true);
    expect(existsSync(`${downloadDestination}/${tgzName}-${newArch(platformInfo!.arch)}.tgz`)).toBe(true);
  });
});
