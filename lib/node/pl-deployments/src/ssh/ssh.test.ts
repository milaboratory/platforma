import { test } from 'vitest';
import * as ssh from 'ssh2';
import { sshConnect, sshExec } from './ssh';
import * as fs from 'fs';

test('integration, should connect to ssh on all platforms', {timeout: 10000},async () => {
  const keys = ssh.utils.generateKeyPairSync('ed25519');
  const client = new ssh.Client()
  await sshConnect(client, {
    host: '',
    port: 22,
    username: '',
    privateKey: '',
    passphrase: '',
    timeout: 5000
  });

  const result = await sshExec(client, 'uptime');
  console.log("HERE ssh.test.ts:24:");
  console.dir(result, { depth: 150 });
})
