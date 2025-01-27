import { describe, it, beforeAll, expect, afterAll } from 'vitest';
import { initContainer, getConnectionForSsh, cleanUp as cleanUpT } from './common-utils';
import { SshPl } from '../pl';
import path, { resolve } from 'path';
import { getDefaultPlVersion } from '../../common/pl_version';
import { existsSync, unlinkSync, rmSync } from 'fs';
import { newArch } from '../../common/os_and_arch';
import { downloadBinary } from '../../common/pl_binary_download';
import { ConsoleLoggerAdapter } from '@milaboratories/ts-helpers';

let sshPl: SshPl | null;
const testContainer = await initContainer('pl');

const downloadDestination = resolve(__dirname, '..', 'test-assets', 'downloads');

async function cleanUp() {
  const version = getDefaultPlVersion();
  const platformInfo = await sshPl?.getArch();
  const tgzName = 'supervisord-0.7.3';

  unlinkSync(`${downloadDestination}/pl-${version}-${newArch(platformInfo!.arch)}.tgz`);
  unlinkSync(`${downloadDestination}/${tgzName}-${newArch(platformInfo!.arch)}.tgz`);
  rmSync(downloadDestination, { recursive: true });
}
beforeAll(async () => {
  sshPl = await SshPl.init(getConnectionForSsh(testContainer));
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

  it('Check start/stop cmd', async () => {
    await sshPl?.platformaInit(downloadDestination);
    await sshPl?.stop();
    let isAlive = await sshPl?.isAlive();
    expect(isAlive).toBe(false);
    await sshPl?.start();
    isAlive = await sshPl?.isAlive();
    expect(isAlive).toBe(true);
  });

  it('downloadBinariesAndUploadToServer', async () => {
    await sshPl?.stop();
    await sshPl?.downloadBinariesAndUploadToTheServer(downloadDestination);

    const pathSupervisor = `${await sshPl?.getSupervisorBinDirOnServer()}/supervisord`;
    const pathMinio = `${await sshPl?.getMinioBinDirOnServer()}/minio`;

    expect((await sshPl?.sshClient.checkPathExists(pathSupervisor))?.exists).toBe(true);
    expect((await sshPl?.sshClient.checkPathExists(pathMinio))?.exists).toBe(true);
  });

  it('platformaInit', async () => {
    const result = await sshPl?.platformaInit(downloadDestination);
    expect(await sshPl?.sshClient.checkFileExists(`${await sshPl?.getPlatformaRemoteWorkingDir()}/config.yaml`)).toBe(true);
    expect(typeof result?.ports).toBe('object');
    expect(result?.plPassword).toBeTruthy();
    expect(result?.plUser).toBeTruthy();
  });

  it('Transfer Platforma to server', async () => {
    const plPath = await sshPl?.downloadPlatformaBinaries(downloadDestination);
    const plFolderName = path.basename(plPath!.archivePath);
    const dirPath = path.resolve(downloadDestination, plFolderName);
    await sshPl?.sshClient.uploadDirectory(dirPath, `/home/pl-doctor/${plFolderName}`);
    console.log(plPath, dirPath);

    const execResult2 = await testContainer!.exec(['cat', `/home/pl-doctor/${plFolderName}/.ok`]);
    const output2 = execResult2.output.trim();
    expect(output2).toBe('ok');
  });

  it('Get free port', async () => {
    await sshPl?.platformaInit(downloadDestination);
    const isAlive = await sshPl?.isAlive();
    expect(isAlive).toBe(true);
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

afterAll(async () => {
  await cleanUpT(testContainer);
  cleanUp();
});
