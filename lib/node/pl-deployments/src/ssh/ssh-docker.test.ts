import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import type { StartedTestContainer } from 'testcontainers';
import { GenericContainer } from 'testcontainers';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import path from 'path';
import { SshClient } from './ssh';
import ssh from 'ssh2';

let client: SshClient;

let container: StartedTestContainer;
const SSH_PORT = [22, 3001];
let privateKey = '';

const publicKeyPath = getPathForFile('pub-key.pub');
const privateKeyPath = getPathForFile('private-key.private');

const localFileUpload = getPathForFile('test-file.txt');
const localFileDownload = getPathForFile('test-file-download.txt');

function getPathForFile(fileName: string) {
  return path.resolve(__dirname, 'test-assets', fileName);
}

function generateKeys() {
  const keys = ssh.utils.generateKeyPairSync('ed25519');
  privateKey = keys.private;
  writeFileSync(publicKeyPath, keys.public);
  writeFileSync(privateKeyPath, keys.private);
}

function initPrivateKey() {
  privateKey = readFileSync(privateKeyPath, { encoding: 'utf-8' });
}

async function initContainer() {
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

    container = await container1.withExposedPorts(...SSH_PORT).withReuse().start();
  } else {
    container = fromCacheContainer;
  }
  initPrivateKey();
  const hostData = getContainerHostAndPort();
  console.log(`SSH доступен на ${hostData.host}:${hostData.port}`);
}

function getContainerHostAndPort() {
  return {
    port: container.getMappedPort(22),
    host: container.getHost(),
  };
}

function getConnectionForSsh(debug: boolean = false) {
  const hostData = getContainerHostAndPort();

  return {
    host: hostData.host,
    port: hostData.port,
    username: 'pl-doctor',
    privateKey: privateKey,
    debug: debug ? console.log : undefined,
  };
}

function cleanUp() {
  if (existsSync(localFileUpload))
    unlinkSync(localFileUpload);
  if (existsSync(localFileDownload))
    unlinkSync(localFileDownload);
}

beforeAll(async () => {
  await initContainer();
  client = await SshClient.init(getConnectionForSsh());
});

describe('SSH Tests', () => {
  it('should upload a file to the SSH server', async () => {
    const data = `Test data ${new Date().getTime()}`;
    const remoteFile = '/home/pl-doctor/uploaded-file.txt';
    writeFileSync(localFileUpload, data);
    const result = await client.uploadFile(localFileUpload, remoteFile);
    expect(result).toBe(true);
    const execResult = await container.exec(['cat', remoteFile]);
    const output = execResult.output.trim();
    expect(output).toBe(data);
  });

  it('should download file from SSH server', async () => {
    const data = `Test data ${new Date().getTime()}`;
    // const localFile = './test-file-upload.txt';
    const remoteFile = '/home/pl-doctor/uploaded-file.txt';

    writeFileSync(localFileDownload, data);

    const uploadResult = await client.uploadFile(localFileDownload, remoteFile);
    expect(uploadResult).toBe(true);

    const downloadResult = await client.downloadFile(remoteFile, localFileDownload);
    expect(downloadResult).toBe(true);
    expect(readFileSync(localFileDownload, { encoding: 'utf-8' })).toBe(data);
  });

  it('Simple server should forward remote SSH port to a local port', async () => {
    const localPort = 3001;

    const resFailed = await fetch(`http://127.0.0.1:${localPort}`).catch((err) => console.log('Must fail'));
    expect(resFailed).toBe(undefined);

    const { server } = await client.forwardPort({
      remotePort: localPort,
      localPort,
    });

    const res = await fetch(`http://127.0.0.1:${localPort}`);
    expect(await res.text()).toBe('Hello, this is a simple Node.js server!');

    server.close();
  });

  it('Auth types', async () => {
    const hostData = getContainerHostAndPort();
    const types = await client.getAuthTypes(hostData.host, hostData.port);
    expect(types[0]).toBe('publickey');
  });
});

describe('sshConnect', () => {
  it('should successfully connect to the SSH server', async () => {
    const client = new SshClient();
    await expect(client.connect(getConnectionForSsh())).resolves.toBeUndefined();
    client.close();
  });

  it('should fail with invalid credentials', async () => {
    const client = new SshClient();
    await expect(client.connect({ ...getConnectionForSsh(), privateKey: '123' })).rejects.toThrow();
    client.close();
  });

  it('should timeout if the server is unreachable', async () => {
    const client = new SshClient();
    await expect(client.connect({ ...getConnectionForSsh(), port: 3233 })).rejects.toThrow('');
    client.close();
  });
});

describe('sshExec', () => {
  it('should execute a valid command and return stdout', async () => {
    const { stdout, stderr } = await client.exec('echo "Hello, SSH"');
    expect(stdout.trim()).toBe('Hello, SSH');
    expect(stderr).toBe('');
  });

  it('should capture stderr for an invalid command', async () => {
    const command = 'nonexistentcommand';
    await expect(client.exec(command)).rejects.toThrow();
  });

  it('should handle a command with both stdout and stderr', async () => {
    const { stdout, stderr } = await client.exec('sh -c "echo stdout && echo stderr >&2"');
    expect(stdout.trim()).toBe('stdout');
    expect(stderr.trim()).toBe('stderr');
  });
});

afterAll(async () => {
  if (container) {
    await container.stop();
  }
  cleanUp();
});
