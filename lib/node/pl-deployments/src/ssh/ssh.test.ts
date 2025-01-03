import { describe, expect, it, test, vi } from 'vitest';
import * as ssh from 'ssh2';
import { forwardPort, isValidHostname, sshConnect, sshExec, sshGetAuthTypes } from './ssh';
import { Client } from 'ssh2';
import net from 'net';

vi.mock('ssh2', () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  const onHandlers: Record<string, Function> = {};

  return {
    Client: vi.fn().mockImplementation(() => ({
      on: vi.fn((event, callback) => {
        onHandlers[event] = callback;
        return onHandlers;
      }),
      connect: vi.fn(() => {
        if (onHandlers['ready']) {
          onHandlers['ready']();
        }
      }),
      forwardOut: vi.fn((_, __, ___, ____, cb) => cb(null, {
        pipe: vi.fn(),
      })),
    })),
  };
});

vi.mock('net', async () => {
  return {
    default: {
      createServer: vi.fn().mockImplementation((_, callback) => ({
        listen: vi.fn((port, host, cb) => {
          cb();
        }),
        on: vi.fn(),
        close: vi.fn(),
      })),
    },

  };
});

test.skip('integration, should connect to ssh on all platforms', { timeout: 10000 }, async () => {
  const keys = ssh.utils.generateKeyPairSync('ed25519');
  const client = new ssh.Client();
  await sshConnect(client, {
    host: '',
    port: 22,
    username: '',
    privateKey: '',
    passphrase: '',
    timeout: 5000,
  });

  const result = await sshExec(client, 'uptime');
  console.log('HERE ssh.test.ts:24:');
  console.dir(result, { depth: 150 });
});

describe('sshGetAuthTypes', () => {
  it('should return default auth types when catch', async () => {
    const result = await sshGetAuthTypes('example.com');
    expect(result).toEqual(['publickey', 'password']);
  });
});

describe('forwardPort', () => {
  it('should resolve when the connection is successful', async () => {
    const config = { host: 'localhost' };
    const ports = { remotePort: 22, localPort: 3000 };

    const { server } = await forwardPort(config, ports);

    expect(Client).toHaveBeenCalled();
    expect(net.createServer).toHaveBeenCalled();

    server.close();
  });

  it('should reject if connection fails', async () => {
    vi.mocked(Client).mockImplementationOnce(() => ({
      on: vi.fn((event, cb) => {
        if (event === 'error') cb(new Error('Connection failed'));
      }),
      connect: vi.fn(),
      forwardOut: vi.fn(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);

    const config = { host: 'localhost' };
    const ports = { remotePort: 22, localPort: 3000 };

    await expect(forwardPort(config, ports)).rejects.toThrow('Connection failed');
  });

  it('should call listen with correct arguments', async () => {
    const config = { host: 'localhost' };
    const ports = { remotePort: 22, localPort: 3000 };

    const { server } = await forwardPort(config, ports);

    expect(server.listen).toHaveBeenCalledWith(
      ports.localPort,
      '127.0.0.1',
      expect.any(Function),
    );
  });
});

describe('isValidHostname', () => {
  it('check', async () => {
    expect(await isValidHostname('127.0.0.1')).toBe(true);
    expect(await isValidHostname('127.0.0.1d')).toBe(false);
    expect(await isValidHostname('somedata')).toBe(false);
  });
});
