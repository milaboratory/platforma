import type { ConnectConfig, ClientChannel } from 'ssh2';
import { Client } from 'ssh2';
import net from 'net';
import dns from 'dns';

export type SshAuthMethods = 'publickey' | 'password';
export type SshAuthMethodsResult = SshAuthMethods[];

/** Promisified exec on ssh connection. */
export function sshExec(client: Client, command: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    client.exec(command, (err: any, stream: ClientChannel) => {
      if (err) return reject(err);

      let stdout = '';
      let stderr = '';

      stream.on('close', (code: number) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Command exited with code ${code}`));
        }
      }).on('data', (data: ArrayBuffer) => {
        stdout += data.toString();
      }).stderr.on('data', (data: ArrayBuffer) => {
        stderr += data.toString();
      });
    });
  });
}

/**
 * Promisified connect function for ssh Client.
 */
export function sshConnect(client: Client, config: ConnectConfig): Promise<undefined> {
  return new Promise((resolve, reject) => {
    client.on('ready', () => {
      resolve(undefined);
    }).on('error', (err: any) => {
      reject(err);
    }).on('timeout', () => {
      reject(new Error(`timeout was occurred while waiting for SSH connection.`));
    }).connect(config);
  });
}
/**
 * Get auth types for host
 * @param host - remote host
 * @returns string[] //['publickey', 'password']
 */
export async function sshGetAuthTypes(host: string): Promise<SshAuthMethodsResult> {
  return new Promise((resolve) => {
    let stdout = '';
    sshConnect(new Client(), {
      host,
      username: new Date().getTime().toString(),
      debug: (err: string) => {
        stdout += `${err} \n`;
      },
    })
      .catch((err) => err)
      .finally(() => {
        const types = extractAuthMethods(stdout);
        resolve(types.length === 0 ? ['publickey', 'password'] : types);
      });
  });
}

export function extractAuthMethods(log: string): SshAuthMethodsResult | [] {
  const newFormatMatch = log.match(/Inbound: Received USERAUTH_FAILURE \((.+)\)/);
  if (newFormatMatch && newFormatMatch[1]) {
    return newFormatMatch[1].split(',').map((method) => method.trim()) as SshAuthMethodsResult;
  }
  return [];
}

export function forwardPort(config: ConnectConfig, ports: { remotePort: number; localPort: number; localHost?: string }): Promise<{ server: net.Server }> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let server: net.Server;
    conn.on('ready', () => {
      console.log(`[SSH] Connection to ${config.host}. Remote port ${ports.remotePort} will be available locally on the ${ports.localPort}`);
      server = net.createServer({ pauseOnConnect: true }, (localSocket) => {
        conn.forwardOut('127.0.0.1', 0, '127.0.0.1', ports.remotePort,
          (err, stream) => {
            if (err) {
              console.error('Error opening SSH channel:', err.message);
              localSocket.end();
              return;
            }
            localSocket.pipe(stream);
            stream.pipe(localSocket);
            localSocket.resume();
          },
        );
      });
      server.listen(ports.localPort, '127.0.0.1', () => {
        console.log(`[+] Port local ${ports.localPort} available locally for remote port → :${ports.remotePort}`);
        resolve({ server });
      });

      server.on('error', (err) => {
        conn.end();
        server.close();
        reject(err);
      });

      server.on('close', () => {
        console.log(`Server closed ${JSON.stringify(ports)}`);
        if (conn) {
          console.log(`End SSH connection`);
          conn.end();
        }
      });
    });

    conn.on('error', (err) => {
      console.error('[SSH] SSH connection error', 'ports', ports, err.message);
      server?.close();
      reject(err);
    });

    conn.on('close', () => {
      console.log('[SSH] Connection closed', 'ports', ports);
    });

    conn.connect(config);
  });
}

export function sshCheckHostAvailability(hostname: string): Promise<boolean> {
  return new Promise((resolve) => {
    dns.lookup(hostname, (err) => {
      if (err) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

export async function sshIsPassphraseRequiredForKey(privateKey: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conn.on('error', (err: any) => {
      if (err.message.includes('Cannot parse privateKey')) {
        resolve(true);
      } else {
        if (err.code === 'ECONNREFUSED') {
          resolve(false);
        } else {
          reject(err);
        }
      }
    });

    conn.on('ready', () => {
      conn.end();
      resolve(false);
    });

    try {
      conn.connect({
        username: 'someuser',
        privateKey: privateKey,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      if (err.message.includes('Cannot parse privateKey')) {
        resolve(true);
      } else {
        reject(err);
      }
    }

    resolve(false);
  });
}

export function createClient() {
  return new Client();
}
