import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { writeFileSync, readFileSync } from 'fs';
import { SshClient } from '../ssh';
import ssh from 'ssh2';
import { downloadsFolder, cleanUp, getConnectionForSsh, getContainerHostAndPort, initContainer, localFileDownload, localFileUpload } from './common-utils';
import { ConsoleLoggerAdapter } from '@milaboratories/ts-helpers';

let client: SshClient;
const testContainer = await initContainer('ssh');

beforeAll(async () => {
  client = await SshClient.init(new ConsoleLoggerAdapter(), getConnectionForSsh(testContainer));
});

describe('SSH Tests', () => {
  it('isPassphraseRequiredForKey', async () => {
    const k1 = ssh.utils.generateKeyPairSync('rsa', {
      passphrase: 'password',
      cipher: 'aes256-cbc',
      bits: 2048,
    });
    expect(await SshClient.isPassphraseRequiredForKey(k1.private)).toBe(true);

    const k2 = ssh.utils.generateKeyPairSync('rsa', {
      cipher: 'aes256-cbc',
      bits: 2048,
    });
    expect(await SshClient.isPassphraseRequiredForKey(k2.private)).toBe(false);

    const k3 = ssh.utils.generateKeyPairSync('ecdsa', { bits: 256, comment: 'node.js rules!', passphrase: 'password', cipher: 'aes256-cbc' });
    expect(await SshClient.isPassphraseRequiredForKey(k3.private)).toBe(true);

    const k4 = ssh.utils.generateKeyPairSync('ecdsa', { bits: 256, comment: 'node.js rules!', cipher: 'aes256-cbc' });
    expect(await SshClient.isPassphraseRequiredForKey(k4.private)).toBe(false);
  });
  it('should create file from string', async () => {
    expect(await client.writeFileOnTheServer('/home/pl-doctor/from-string.txt', 'hello'));

    const execResult = await testContainer.exec(['cat', `/home/pl-doctor/from-string.txt`]);
    const output = execResult.output.trim();
    expect(output).toBe('hello');
  });
  it('should create all directories if none exist', async () => {
    const remotePath = '/home/pl-doctor/upload/nested/directory';
    await expect(client.createRemoteDirectory(remotePath)).resolves.not.toThrow();

    // Additional check to ensure the directory exists
    await client.withSftp(async (sftp) => {
      const stat = await new Promise((resolve, reject) => {
        sftp.stat(remotePath, (err, stats) => {
          if (err) return reject(err);
          resolve(stats);
        });
      });
      expect(stat).toBeDefined();
    });
  });

  it('should handle existing directories gracefully', async () => {
    const remotePath = '/home/pl-doctor/upload/nested';

    await expect(client.createRemoteDirectory(remotePath)).resolves.not.toThrow();
    await expect(client.createRemoteDirectory(remotePath)).resolves.not.toThrow();
  });

  it('should throw an error if an invalid path is provided', async () => {
    const remotePath = '/invalid_path/nested';

    await expect(client.createRemoteDirectory(remotePath)).rejects.toThrow();
  });

  it('Upload directory', async () => {
    const remoteDir = '/home/pl-doctor';
    await client.uploadDirectory(`${downloadsFolder}/rec-upload`, '/home/pl-doctor/rec-upload');

    const execResult = await testContainer.exec(['cat', `${remoteDir}/rec-upload/sub-1/test.txt`]);
    const output = execResult.output.trim();
    expect(output).toBe('test-1');

    const execResult1 = await testContainer.exec(['cat', `${remoteDir}/rec-upload/sub-1/sub-1-1/test-5.txt`]);
    const output1 = execResult1.output.trim();
    expect(output1).toBe('test-5');

    const execResult2 = await testContainer.exec(['cat', `${remoteDir}/rec-upload/sub-1/sub-1-18/test-2.txt`]);
    const output2 = execResult2.output.trim();
    expect(output2).toBe('test-2');
  });

  it('should upload a file to the SSH server', async () => {
    const data = `Test data ${new Date().getTime()}`;
    const remoteFile = '/home/pl-doctor/uploaded-file.txt';
    writeFileSync(localFileUpload, data);
    const result = await client.uploadFile(localFileUpload, remoteFile);
    expect(result).toBe(true);
    const execResult = await testContainer.exec(['cat', remoteFile]);
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
    const hostData = getContainerHostAndPort(testContainer);
    const types = await SshClient.getAuthTypes(hostData.host, hostData.port);
    expect(types[0]).toBe('publickey');
  });
});

describe('sshConnect', () => {
  it('should successfully connect to the SSH server', async () => {
    const client = await SshClient.init(new ConsoleLoggerAdapter(), getConnectionForSsh(testContainer));
    client.close();
  });

  it('should fail with invalid credentials', async () => {
    await expect(SshClient.init(new ConsoleLoggerAdapter(), { ...getConnectionForSsh(testContainer), privateKey: '123' })).rejects.toThrow();
  });

  it('should timeout if the server is unreachable', async () => {
    await expect(SshClient.init(new ConsoleLoggerAdapter(), { ...getConnectionForSsh(testContainer), port: 3233 })).rejects.toThrow('');
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
  await cleanUp(testContainer);
});
