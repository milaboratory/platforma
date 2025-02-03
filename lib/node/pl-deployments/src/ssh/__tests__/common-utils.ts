import type { StartedTestContainer } from 'testcontainers';
import { GenericContainer } from 'testcontainers';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { mkdir, rm } from 'fs/promises';
import path from 'path';
import type { ConnectConfig } from 'ssh2';
import ssh from 'ssh2';
import fs from 'fs';

const SSH_PORT = [22, 3001];

const publicKeyPath = getPathForFile('pub-key.pub');
const privateKeyPath = getPathForFile('private-key.private');

export const localFileUpload = getPathForFile('test-file.txt');
export const localFileDownload = getPathForFile('test-file-download.txt');
export const downloadsFolder = path.resolve(__dirname, '..', 'test-assets', 'downloads');
export const recUpload = path.resolve(__dirname, '..', 'test-assets', 'downloads', 'rec-upload');

export async function createTestDirForRecursiveUpload() {
  const pathBase = path.resolve(__dirname, '..', 'test-assets', 'downloads', 'rec-upload', 'sub-1');
  const path2 = path.resolve(__dirname, '..', 'test-assets', 'downloads', 'rec-upload', 'sub-1', 'sub-1-1');

  await mkdir(pathBase, { recursive: true });
  await mkdir(path2, { recursive: true });

  for (let i = 0; i < 19; i++) {
    const path2 = path.resolve(__dirname, '..', 'test-assets', 'downloads', 'rec-upload', 'sub-1', `sub-1-${i}`);
    await mkdir(path2, { recursive: true });

    for (let i = 0; i < 3; i++) {
      writeFileSync(path.resolve(path2, `test-${i}.txt`), `test-${i}`);
    }
  }

  for (let i = 1; i < 100; i++) {
    writeFileSync(path.resolve(pathBase, `test-${i}.txt`), `test-${i}`);
  }
  writeFileSync(path.resolve(pathBase, `test.txt`), `test-1`);
  writeFileSync(path.resolve(path2, 'test-5.txt'), 'test-5');
}

export function getPathForFile(fileName: string) {
  return path.resolve(__dirname, '..', 'test-assets', fileName);
}

export function generateKeys() {
  const keys = ssh.utils.generateKeyPairSync('ecdsa', { bits: 256, comment: 'node.js rules!' });
  if (!existsSync(publicKeyPath) || !existsSync(privateKeyPath)) {
    writeFileSync(publicKeyPath, keys.public);
    writeFileSync(privateKeyPath, keys.private);
  }
}

export function initPrivateKey(): string {
  generateKeys();
  return readFileSync(privateKeyPath, { encoding: 'utf-8' });
}

export async function initContainer(name: string): Promise<StartedTestContainer> {
  await createTestDirForRecursiveUpload();

  const fromCacheContainer = await new GenericContainer(`pl-ssh-test-container-${name}:1.0.0`)
    .withExposedPorts(...SSH_PORT)
    .withReuse()
    .withName(`pl-ssh-test-${name}`)
    .start()
    .catch((err) => console.log('No worries, creating a new container'));

  if (!fromCacheContainer) {
    generateKeys();
    const container1 = await GenericContainer.fromDockerfile(path.resolve(__dirname, '..'))
      .withCache(true)
      .build(`pl-ssh-test-container-${name}:1.0.0`, { deleteOnExit: false });

    return container1.withExposedPorts(...SSH_PORT).withReuse().start();
  }

  return fromCacheContainer;
}

export function getContainerHostAndPort(container: StartedTestContainer) {
  return {
    port: container.getMappedPort(22),
    host: container.getHost(),
  };
}

function logToFile(message: string) {
  const logFileName = 'log.txt';
  const logFilePath = path.join(__dirname, '..', 'test-assets', logFileName);

  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  fs.appendFile(logFilePath, logMessage, (err) => {
    if (err) {
      console.error('Error writing to log file:', err);
    }
  });
}

export function getConnectionForSsh(container: StartedTestContainer, debug: boolean = false): ConnectConfig {
  const hostData = getContainerHostAndPort(container);
  const privateKey = initPrivateKey();
  const config = {
    host: hostData.host,
    port: hostData.port,
    username: 'pl-doctor',
    privateKey: privateKey,
    debug: debug ? logToFile : undefined,
  };
  logToFile(JSON.stringify(config, null, 4));
  return config;
}

export async function cleanUp(container: StartedTestContainer) {
  await container.stop();

  if (existsSync(localFileUpload)) {
    unlinkSync(localFileUpload);
  }

  if (existsSync(localFileDownload)) {
    unlinkSync(localFileDownload);
  }

  if (existsSync(recUpload)) {
    await rm(recUpload, { recursive: true });
  }
}
