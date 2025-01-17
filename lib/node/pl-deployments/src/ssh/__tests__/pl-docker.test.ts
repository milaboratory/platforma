import { describe, it, beforeAll, expect, afterAll } from 'vitest';
import { initContainer, getConnectionForSsh, testContainer } from './common-utils';
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
  sshPl = await SshPl.init(getConnectionForSsh(true));
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

  it('platformaInit', async () => {
    const result = await sshPl?.platformaInit(downloadDestination);
    for (const [path, content] of Object.entries(result!.filesToCreate)) {
      const execResult = await testContainer!.exec(['cat', path]);
      expect(await sshPl?.sshClient.checkFileExists(path)).toBe(true);
      expect(execResult.output).toBe(content);
    }
  });

  it('Transfer Platforma to server', async () => {
    const plPath = await sshPl?.downloadPlatformaBinaries(downloadDestination);
    const plFolderName = path.basename(path.dirname(path.dirname(plPath!)));
    const dirPath = path.resolve(downloadDestination, plFolderName);
    await sshPl?.sshClient.uploadDirectory(dirPath, `/home/pl-doctor/${plFolderName}`);
    console.log(plPath, dirPath);

    const execResult2 = await testContainer!.exec(['cat', `/home/pl-doctor/${plFolderName}/.ok`]);
    const output2 = execResult2.output.trim();
    expect(output2).toBe('ok');
  });

  it('Get free port', async () => {
    await sshPl?.platformaInit(downloadDestination);
    const port = await sshPl?.getFreePortForPlatformaOnServer();
    expect(typeof port).toBe('number');
  });

  it('fetchPorts', async () => {
    const ports = await sshPl?.fetchPorts();
    if (ports) {
      Object.entries(ports).forEach(([, port]) => {
        expect(typeof port.local).toBe('number');
        expect(typeof port.remote).toBe('number');
      });
    }

    expect(ports?.grpc).toMatchObject({
      local: expect.anything(),
      remote: expect.anything(),
    });
    expect(ports?.monitoring).toMatchObject({
      local: expect.anything(),
      remote: expect.anything(),
    });
    expect(ports?.debug).toMatchObject({
      local: expect.anything(),
      remote: expect.anything(),
    });
    expect(ports?.minioPort).toMatchObject({
      local: expect.anything(),
      remote: expect.anything(),
    });
    expect(ports?.minioConsolePort).toMatchObject({
      local: expect.anything(),
      remote: expect.anything(),
    });
  });
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
