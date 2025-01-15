import type { StartedTestContainer } from 'testcontainers';
import { GenericContainer } from 'testcontainers';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { mkdir, rm } from 'fs/promises';
import path from 'path';
import type { ConnectConfig } from 'ssh2';
import ssh from 'ssh2';
import fs from 'fs';

export let testContainer: StartedTestContainer;
const SSH_PORT = [22, 3001];
let privateKey = '';

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
  const keys = ssh.utils.generateKeyPairSync('ed25519');
  privateKey = keys.private;
  writeFileSync(publicKeyPath, keys.public);
  writeFileSync(privateKeyPath, keys.private);
}

export function initPrivateKey() {
  privateKey = readFileSync(privateKeyPath, { encoding: 'utf-8' });
}

export async function initContainer() {
  createTestDirForRecursiveUpload();
  const fromCacheContainer = await new GenericContainer('pl-ssh-test-container:1.0.0')
    .withExposedPorts(...SSH_PORT)
    .withReuse()
    .start().catch((err) => console.log('No wories we just need create new container', err));
  console.log('container exist', !!fromCacheContainer);

  if (!fromCacheContainer) {
    generateKeys();
    const container1 = await GenericContainer
      .fromDockerfile(path.resolve(__dirname))
      .withCache(true)
      .build('pl-ssh-test-container:1.0.0', { deleteOnExit: false });

    testContainer = await container1.withExposedPorts(...SSH_PORT).withReuse().start();
  } else {
    testContainer = fromCacheContainer;
  }
  initPrivateKey();
  const hostData = getContainerHostAndPort();
  console.log(`SSH available on ${hostData.host}:${hostData.port}`);
}

export function getContainerHostAndPort() {
  return {
    port: testContainer.getMappedPort(22),
    host: testContainer.getHost(),
  };
}

function logToFile(message: string) {
  const logFileName = 'log.txt';
  const logFilePath = path.join(__dirname, logFileName);

  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;

  // eslint-disable-next-line @stylistic/type-annotation-spacing, @typescript-eslint/no-explicit-any
  fs.appendFile(logFilePath, logMessage, (err:any) => {
    if (err) {
      console.error('Error write to log file:', err);
    }
  });
}

export function getConnectionForSsh(debug: boolean = false): ConnectConfig {
  const hostData = getContainerHostAndPort();

  return {
    host: hostData.host,
    port: hostData.port,
    username: 'pl-doctor',
    privateKey: privateKey,
    debug: debug ? logToFile : undefined,
  };
}

export async function cleanUp() {
  if (existsSync(localFileUpload))
    unlinkSync(localFileUpload);
  if (existsSync(localFileDownload))
    unlinkSync(localFileDownload);
  if (existsSync(recUpload))
    await rm(recUpload, { recursive: true });
}
