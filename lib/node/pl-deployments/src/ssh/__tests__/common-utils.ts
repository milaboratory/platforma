import type { StartedTestContainer } from 'testcontainers';
import { GenericContainer } from 'testcontainers';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { ConnectConfig } from 'ssh2';
import fs from 'node:fs';

const SSH_PORT = [22, 3001];

export const testAssetsPath = path.resolve(__dirname, '..', '..', '..', 'test-assets');

const publicKeyPath = path.resolve(testAssetsPath, 'public-key.pem');
const privateKeyPath = path.resolve(testAssetsPath, 'private-key.pem');
if (!existsSync(publicKeyPath) || !existsSync(privateKeyPath)) {
  console.error('SSH keys does not exist, see pl-deployments/README.md and regenerate them');
  process.exit(1);
}

export function readPrivateKey(): string {
  return readFileSync(privateKeyPath, { encoding: 'utf-8' });
}

export async function initContainer(name: string): Promise<StartedTestContainer> {
  const imageName = `pl-ssh-test-container-${name}:1.0.0`;
  const containerName = `pl-ssh-test-${name}`;

  console.log('No worries, creating a new container');

  const container = await GenericContainer
    .fromDockerfile(path.resolve(__dirname, '..', '..', '..'))
    .withCache(true)
    .build(imageName, { deleteOnExit: false });

  return await container
    .withExposedPorts(...SSH_PORT)
    .withReuse()
    .withName(containerName)
    .start();
}

export function getContainerHostAndPort(container: StartedTestContainer) {
  return {
    port: container.getMappedPort(22),
    host: container.getHost(),
  };
}

function logToFile(message: string) {
  const logFileName = 'log.txt';
  const logFilePath = path.join(testAssetsPath, logFileName);

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
  const privateKey = readPrivateKey();
  const config = {
    host: hostData.host,
    port: hostData.port,
    username: 'pl-doctor',
    privateKey: privateKey,
    passphrase: 'password',
    debug: debug ? logToFile : undefined,
  };
  logToFile(JSON.stringify(config, null, 4));
  return config;
}

export async function cleanUp(container: StartedTestContainer) {
  await container.stop();
}
