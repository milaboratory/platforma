import { describe, it, beforeAll, expect, afterAll } from 'vitest';
import { initContainer, getConnectionForSsh, cleanUp as cleanUpT } from './common-utils';
import { SshPl } from '../pl';
import upath from 'upath';
import { getDefaultPlVersion } from '../../common/pl_version';
import { existsSync, unlinkSync, rmSync } from 'fs';
import { newArch } from '../../common/os_and_arch';
import { downloadBinary } from '../../common/pl_binary_download';
import { ConsoleLoggerAdapter } from '@milaboratories/ts-helpers';
import * as plpath from '../pl_paths';

let sshPl: SshPl;
const testContainer = await initContainer('pl');

const downloadDestination = upath.resolve(__dirname, '..', '..', '..', 'test-assets', 'downloads');

async function cleanUp() {
  const version = getDefaultPlVersion();
  const arch = await sshPl.getArch();
  const tgzName = 'supervisord-0.7.3';

  unlinkSync(`${downloadDestination}/pl-${version}-${newArch(arch!.arch)}.tgz`);
  unlinkSync(`${downloadDestination}/${tgzName}-${newArch(arch!.arch)}.tgz`);
  rmSync(downloadDestination, { recursive: true });
}
beforeAll(async () => {
  const logger = new ConsoleLoggerAdapter();
  sshPl = await SshPl.init(logger, getConnectionForSsh(testContainer));
}, 200000);

describe('SshPl', async () => {
  it('User home direcory', async () => {
    const home = await sshPl.getUserHomeDirectory();
    expect(home).toBe('/home/pl-doctor');
  });

  it('Get OS arch', async () => {
    const platformInfo = await sshPl.getArch();
    expect(platformInfo).toHaveProperty('platform');
    expect(platformInfo).toHaveProperty('arch');

    expect(['x86_64', 'aarch64']).toContain(platformInfo.arch);
    expect(platformInfo?.platform).toBe('Linux');
  });

  it('Check start/stop cmd, and stopAndClean', async () => {
    await sshPl.platformaInit({
      localWorkdir: downloadDestination,
      license: { type: 'env' },
    });
    expect((await sshPl.isAlive()).allAlive).toBe(true);

    await sshPl.stop();
    expect((await sshPl.isAlive()).allAlive).toBe(false);

    // FIXME: it's not working in CI
    // await sshPl.start();
    // expect((await sshPl.isAlive()).allAlive).toBe(true);

    await sshPl.stopAndClean();
    expect((await sshPl.isAlive()).allAlive).toBe(false);
  });

  it('downloadBinariesAndUploadToServer', async () => {
    const arch = await sshPl.getArch();
    const remoteHome = await sshPl.getUserHomeDirectory();
    await sshPl.stop(); // ensure stopped
    await sshPl.downloadBinariesAndUploadToTheServer(downloadDestination, remoteHome, arch);

    const pathSupervisor = `${plpath.supervisorBinDir(remoteHome, arch.arch)}/supervisord`;
    const pathMinio = `${plpath.minioDir(remoteHome, arch.arch)}/minio`;

    expect((await sshPl?.sshClient.checkPathExists(pathSupervisor))?.exists).toBe(true);
    expect((await sshPl?.sshClient.checkPathExists(pathMinio))?.exists).toBe(true);
  });

  it('platformaInit', async () => {
    const result = await sshPl.platformaInit({
      localWorkdir: downloadDestination,
      license: { type: 'env' },
    });

    const remoteHome = await sshPl.getUserHomeDirectory();

    expect(await sshPl?.sshClient.checkFileExists(plpath.platformaConf(remoteHome))).toBe(true);
    expect(typeof result?.ports).toBe('object');
    expect(result?.plPassword).toBeTruthy();
    expect(result?.plUser).toBeTruthy();
    expect(result?.useGlobalAccess).toBeFalsy();
  });

  it('Transfer Platforma to server', async () => {
    const arch = await sshPl.getArch();

    const plPath = await downloadBinary(
      new ConsoleLoggerAdapter(),
      downloadDestination,
      'pl', `pl-${getDefaultPlVersion()}`,
      arch.arch,
      arch.platform,
    );

    const plFolderName = upath.basename(plPath.targetFolder);
    const dirPath = upath.resolve(downloadDestination, plFolderName);
    await sshPl.sshClient.uploadDirectory(dirPath, `/home/pl-doctor/${plFolderName}`);

    console.log(plPath, dirPath);

    const execResult2 = await testContainer!.exec(['cat', `/home/pl-doctor/${plFolderName}/.ok`]);
    const output2 = execResult2.output.trim();
    expect(output2).toBe('ok');
  });

  it('Get free port', async () => {
    await sshPl.platformaInit({
      localWorkdir: downloadDestination,
      license: { type: 'env' },
    });
    const isAlive = await sshPl?.isAlive();
    expect(isAlive.allAlive).toBe(true);

    const arch = await sshPl.getArch();
    const remoteHome = await sshPl.getUserHomeDirectory();
    const port = await sshPl.getFreePortForPlatformaOnServer(remoteHome, arch);

    expect(typeof port).toBe('number');
  });

  it('fetchPorts', async () => {
    const arch = await sshPl.getArch();
    const remoteHome = await sshPl.getUserHomeDirectory();
    const ports = await sshPl.fetchPorts(remoteHome, arch);

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

  it('Start ssh without global access, restart it with global access', async () => {
    const remoteHome = await sshPl.getUserHomeDirectory();

    await sshPl.platformaInit({ localWorkdir: downloadDestination, license: { type: 'env' } });
    let isAlive = await sshPl?.isAlive();
    expect(isAlive.allAlive).toBe(true);

    await sshPl.platformaInit({
      localWorkdir: downloadDestination,
      license: { type: 'env' },
      useGlobalAccess: true,
    });
    isAlive = await sshPl?.isAlive();
    expect(isAlive.allAlive).toBe(true);

    const config = await sshPl.sshClient.readFile(plpath.platformaConf(remoteHome));
    expect(config).contain('bin-ga');
  });

  it('Download pl. We have archive and extracted data', async () => {
    const arch = await sshPl.getArch();

    const result = await downloadBinary(
      new ConsoleLoggerAdapter(),
      downloadDestination,
      'pl', `pl-${getDefaultPlVersion()}`,
      arch.arch,
      arch.platform,
    );

    const version = getDefaultPlVersion();
    expect(!!result).toBe(true);
    expect(existsSync(`${downloadDestination}/pl-${version}-${newArch(arch.arch)}.tgz`)).toBe(true);
  });

  it('Download other software', async () => {
    const arch = await sshPl.getArch();

    const softwareName = 'supervisord';
    const tgzName = 'supervisord-0.7.3';

    const result = await downloadBinary(
      new ConsoleLoggerAdapter(),
      downloadDestination,
      softwareName, tgzName,
      arch.arch,
      arch.platform,
    );

    expect(!!result).toBe(true);
    expect(existsSync(`${downloadDestination}/${tgzName}-${newArch(arch.arch)}.tgz`)).toBe(true);
  });
});

afterAll(async () => {
  await cleanUp();
  await cleanUpT(testContainer);
}, 200000);
