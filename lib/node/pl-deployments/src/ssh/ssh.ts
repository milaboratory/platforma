/* eslint-disable @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/no-base-to-string */
import type { ConnectConfig, ClientChannel, SFTPWrapper } from 'ssh2';
import ssh, { Client } from 'ssh2';
import net from 'node:net';
import dns from 'node:dns';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import upath from 'upath';
import { RetryablePromise, type MiLogger } from '@milaboratories/ts-helpers';
import { randomBytes } from 'node:crypto';

const defaultConfig: ConnectConfig = {
  keepaliveInterval: 60000,
  keepaliveCountMax: 10,
};

export type SshAuthMethods = 'publickey' | 'password';
export type SshAuthMethodsResult = SshAuthMethods[];
export type SshDirContent = {
  files: string[];
  directories: string[];
};

export class SshClient {
  private config?: ConnectConfig;
  public homeDir?: string;
  private forwardedServers: net.Server[] = [];

  constructor(
    private readonly logger: MiLogger,
    private readonly client: Client,
  ) {}

  /**
   * Initializes the SshClient and establishes a connection using the provided configuration.
   * @param config - The connection configuration object for the SSH client.
   * @returns A new instance of SshClient with an active connection.
   */
  public static async init(logger: MiLogger, config: ConnectConfig): Promise<SshClient> {
    const withDefaults = {
      ...defaultConfig,
      ...config,
    };

    const client = new SshClient(logger, new Client());
    await client.connect(withDefaults);

    return client;
  }

  public getForwardedServers() {
    return this.forwardedServers;
  }

  public getFullHostName() {
    return `${this.config?.host}:${this.config?.port}`;
  }

  public getUserName() {
    return this.config?.username;
  }

  /**
   * Connects to the SSH server using the specified configuration.
   * @param config - The connection configuration object for the SSH client.
   * @returns A promise that resolves when the connection is established or rejects on error.
   */
  public async connect(config: ConnectConfig) {
    this.config = config;
    return await connect(this.client, config, () => {}, () => {});
  }

  /**
   * Executes a command on the SSH server.
   * @param command - The command to execute on the remote server.
   * @returns A promise resolving with the command's stdout and stderr outputs.
   */
  public async exec(command: string): Promise<SshExecResult> {
    return new Promise((resolve, reject) => {
      this.client.exec(command, (err: any, stream: ClientChannel) => {
        if (err) {
          return reject(new Error(`ssh.exec: ${command}: ${err}`));
        }

        let stdout = '';
        let stderr = '';

        stream.on('close', (code: number) => {
          if (code === 0) {
            resolve({ stdout, stderr });
          } else {
            reject(new Error(`Command ${command} exited with code ${code}, stdout: ${stdout}, stderr: ${stderr}`));
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
   * Retrieves the supported authentication methods for a given host and port.
   * @param host - The hostname or IP address of the server.
   * @param port - The port number to connect to on the server.
   * @returns 'publickey' | 'password'[] A promise resolving with a list of supported authentication methods.
   */
  public static async getAuthTypes(host: string, port: number): Promise<SshAuthMethodsResult> {
    return new Promise((resolve) => {
      let stdout = '';
      const conn = new Client();

      conn.on('ready', () => {
        conn.end();
        const types = this.extractAuthMethods(stdout);
        resolve(types.length === 0 ? ['publickey', 'password'] : types as SshAuthMethodsResult);
      });

      conn.on('error', () => {
        conn.end();
        resolve(['publickey', 'password']);
      });

      conn.connect({
        host,
        port,
        username: new Date().getTime().toString(),
        debug: (err) => {
          stdout += `${err}\n`;
        },
      });
    });
  }

  /**
   * Extracts authentication methods from debug logs.
   * @param log - The debug log output containing authentication information.
   * @returns An array of extracted authentication methods.
   */
  private static extractAuthMethods(log: string): string[] {
    const match = log.match(/Inbound: Received USERAUTH_FAILURE \((.+)\)/);
    return match && match[1] ? match[1].split(',').map((method) => method.trim()) : [];
  }

  /**
   * Sets up port forwarding between a remote port on the SSH server and a local port.
   * A new connection is used for this operation instead of an existing one.
   * @param ports - An object specifying the remote and local port configuration.
   * @param config - Optional connection configuration for the SSH client.
   * @returns { server: net.Server } A promise resolving with the created server instance.
   */
  public async forwardPort(ports: { remotePort: number; localPort: number; localHost?: string }, config?: ConnectConfig): Promise<{ server: net.Server }> {
    const log = `ssh.forward:${ports.localPort}:${ports.remotePort}.id_${randomBytes(1).toString('hex')}`;
    config = config ?? this.config;

    // we make this thing persistent so that if the connection
    // drops (it happened in the past because of lots of errors and forwardOut opened channels),
    // we'll recreate it here.
    const persistentClient = new RetryablePromise((p: RetryablePromise<Client>) => {
      return new Promise<Client>((resolve, reject) => {
        const client = new Client();

        client.on('ready', () => {
          this.logger.info(`${log}.client.ready`);
          resolve(client);
        });

        client.on('error', (err) => {
          this.logger.info(`${log}.client.error: ${err}`);
          p.reset();
          reject(err);
        });

        client.on('close', () => {
          this.logger.info(`${log}.client.closed`);
          p.reset();
        });

        client.connect(config!);
      });
    });

    await persistentClient.ensure(); // warm up a connection

    return new Promise((resolve, reject) => {
      const server = net.createServer({ pauseOnConnect: true }, async (localSocket) => {
        const sockLog = `${log}.sock_${randomBytes(1).toString('hex')}`;
        // this.logger.info(`${sockLog}.localSocket: start connection`);
        let conn: Client;
        try {
          conn = await persistentClient.ensure();
        } catch (e: unknown) {
          this.logger.info(`${sockLog}.persistentClient.catch: ${e}`);
          localSocket.end();
          return;
        }

        // Remove TCP buffering.
        // Although it means less throughput (bad), it also less latency (good).
        // It could help when we have
        // small messages like in our grpc transactions.
        // And it also could help when we have tcp forwarding to not buffer messages in the middle.
        (conn as any).setNoDelay(true);
        localSocket.setNoDelay(true);

        let stream: ClientChannel;
        try {
          stream = await forwardOut(this.logger, conn, '127.0.0.1', 0, '127.0.0.1', ports.remotePort);
        } catch (e: unknown) {
          this.logger.error(`${sockLog}.forwardOut.err: ${e}`);
          localSocket.end();
          return;
        }

        localSocket.pipe(stream);
        stream.pipe(localSocket);
        localSocket.resume();
        // this.logger.info(`${sockLog}.forwardOut: connected`);

        stream.on('error', (err: unknown) => {
          this.logger.error(`${sockLog}.stream.error: ${err}`);
          localSocket.end();
          stream.end();
        });
        stream.on('close', () => {
          // this.logger.info(`${sockLog}.stream.close: closed`);
          localSocket.end();
          stream.end();
        });
        localSocket.on('close', () => {
          this.logger.info(`${sockLog}.localSocket: closed`);
          localSocket.end();
          stream.end();
        });
      });

      server.listen(ports.localPort, '127.0.0.1', () => {
        this.logger.info(`${log}.server: started listening`);
        this.forwardedServers.push(server);
        resolve({ server });
      });

      server.on('error', (err) => {
        server.close();
        reject(new Error(`${log}.server: error: ${JSON.stringify(err)}`));
      });

      server.on('close', () => {
        this.logger.info(`${log}.server: closed ${JSON.stringify(ports)}`);
        this.forwardedServers = this.forwardedServers.filter((s) => s !== server);
      });
    });
  }

  public closeForwardedPorts(): void {
    this.logger.info('[SSH] Closing all forwarded ports...');
    this.forwardedServers.forEach((server) => {
      const rawAddress = server.address();
      if (rawAddress && typeof rawAddress !== 'string') {
        const address: net.AddressInfo = rawAddress;
        this.logger.info(`[SSH] Closing port forward for server ${address.address}:${address.port}`);
      }

      server.close();
    });
    this.forwardedServers = [];
  }

  /**
  * Checks if a specified host is available by performing a DNS lookup.
  * @param hostname - The hostname or IP address to check.
  * @returns A promise resolving with `true` if the host is reachable, otherwise `false`.
  */
  public static async checkHostAvailability(hostname: string): Promise<boolean> {
    return new Promise((resolve) => {
      dns.lookup(hostname, (err) => {
        resolve(!err);
      });
    });
  }

  /**
   * Determines whether a private key requires a passphrase for use.
   * @param privateKey - The private key content to check.
   * @returns A promise resolving with `true` if a passphrase is required, otherwise `false`.
   */
  public static async isPassphraseRequiredForKey(privateKey: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        const keyOrError = ssh.utils.parseKey(privateKey);
        if (keyOrError instanceof Error) {
          resolve(true);
        }
        return resolve(false);
      } catch (err: unknown) {
        console.log('Error parsing privateKey');
        reject(new Error(`ssh.isPassphraseRequiredForKey: err ${err}`));
      }
    });
  }

  /**
   * Uploads a local file to a remote server via SFTP.
   * This function creates new SFTP connection
   * @param localPath - The local file path.
   * @param remotePath - The remote file path on the server.
   * @returns A promise resolving with `true` if the file was successfully uploaded.
   */
  public async uploadFile(localPath: string, remotePath: string): Promise<boolean> {
    return await this.withSftp(async (sftp) => {
      return new Promise((resolve, reject) => {
        sftp.fastPut(localPath, remotePath, (err) => {
          if (err) {
            const newErr = new Error(
              `ssh.uploadFile: err: ${err}, localPath: ${localPath}, remotePath: ${remotePath}`);
            return reject(newErr);
          }
          resolve(true);
        });
      });
    });
  }

  public async withSftp<R>(callback: (sftp: SFTPWrapper) => Promise<R>): Promise<R> {
    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) {
          return reject(new Error(`ssh.withSftp: sftp err: ${err}`));
        }

        callback(sftp)
          .then(resolve)
          .catch((err) => {
            reject(new Error(`ssh.withSftp.callback: err ${err}`));
          })
          .finally(() => {
            sftp?.end();
          });
      });
    });
  }

  public async writeFileOnTheServer(remotePath: string, data: string | Buffer, mode: number = 0o660) {
    return this.withSftp(async (sftp) => {
      return this.writeFile(sftp, remotePath, data, mode);
    });
  }

  public async getForderStructure(sftp: SFTPWrapper, remotePath: string, data: SshDirContent = { files: [], directories: [] }): Promise<SshDirContent> {
    return new Promise((resolve, reject) => {
      sftp.readdir(remotePath, async (err, items) => {
        if (err) {
          return reject(err);
        }

        for (const item of items) {
          const itemPath = `${remotePath}/${item.filename}`;
          if (item.attrs.isDirectory()) {
            data.directories.push(itemPath);
            try {
              await this.getForderStructure(sftp, itemPath, data);
            } catch (error) {
              return reject(error instanceof Error ? error : new Error(String(error)));
            }
          } else {
            data.files.push(itemPath);
          }
        }
        resolve(data);
      });
    });
  }

  public rmdir(sftp: SFTPWrapper, path: string) {
    return new Promise((resolve, reject) => {
      sftp.rmdir(path, (err) => err ? reject(err) : resolve(true));
    });
  }

  public unlink(sftp: SFTPWrapper, path: string) {
    return new Promise((resolve, reject) => {
      sftp.unlink(path, (err) => err ? reject(err) : resolve(true));
    });
  }

  public async deleteFolder(path: string) {
    return this.withSftp(async (sftp) => {
      try {
        const list = await this.getForderStructure(sftp, path);
        this.logger.info(`ssh.deleteFolder list of files and directories`);
        this.logger.info(`ssh.deleteFolder list of files: ${list.files}`);
        this.logger.info(`ssh.deleteFolder list of directories: ${list.directories}`);

        for (const filePath of list.files) {
          this.logger.info(`ssh.deleteFolder unlink file ${filePath}`);
          await this.unlink(sftp, filePath);
        }

        list.directories.sort((a, b) => b.length - a.length);

        for (const directoryPath of list.directories) {
          this.logger.info(`ssh.deleteFolder rmdir  ${directoryPath}`);
          await this.rmdir(sftp, directoryPath);
        }

        await this.rmdir(sftp, path);
        return true;
      } catch (e: unknown) {
        this.logger.error(e);
        const message = e instanceof Error ? e.message : '';
        throw new Error(`ssh.deleteFolder: path: ${path}, message: ${message}`);
      }
    });
  }

  public async readFile(remotePath: string): Promise<string> {
    return this.withSftp(async (sftp) => {
      return new Promise((resolve, reject) => {
        sftp.readFile(remotePath, (err, buffer) => {
          if (err) {
            return reject(new Error(`ssh.readFile: ${err}`));
          }
          resolve(buffer.toString());
        });
      });
    });
  }

  async chmod(path: string, mode: number) {
    return this.withSftp(async (sftp) => {
      return new Promise((resolve, reject) => {
        sftp.chmod(path, mode, (err) => {
          if (err) {
            return reject(new Error(`ssh.chmod: ${err}, path: ${path}, mode: ${mode}`));
          }
          return resolve(undefined);
        });
      });
    });
  }

  async checkFileExists(remotePath: string) {
    return this.withSftp(async (sftp) => {
      return new Promise((resolve, reject) => {
        sftp.stat(remotePath, (err: Error | undefined, stats) => {
          if (err) {
            if ((err as unknown as { code?: number })?.code === 2) {
              return resolve(false);
            }
            return reject(new Error(`ssh.checkFileExists: err ${err}`));
          }
          resolve(stats.isFile());
        });
      });
    });
  }

  async checkPathExists(remotePath: string): Promise<{ exists: boolean; isFile: boolean; isDirectory: boolean }> {
    return this.withSftp(async (sftp) => {
      return new Promise((resolve, reject) => {
        sftp.stat(remotePath, (err, stats) => {
          if (err) {
            if ((err as Error & { code: number }).code === 2) {
              return resolve({ exists: false, isFile: false, isDirectory: false });
            }
            return reject(new Error(`ssh.checkPathExists: ${err}`));
          }
          resolve({
            exists: true,
            isFile: stats.isFile(),
            isDirectory: stats.isDirectory(),
          });
        });
      });
    });
  }

  private async writeFile(sftp: SFTPWrapper, remotePath: string, data: string | Buffer, mode: number = 0o660): Promise<boolean> {
    return new Promise((resolve, reject) => {
      sftp.writeFile(remotePath, data, { mode }, (err) => {
        if (err) {
          return reject(new Error(`ssh.writeFile: err ${err}, remotePath: ${remotePath}`));
        }
        resolve(true);
      });
    });
  }

  public uploadFileUsingExistingSftp(sftp: SFTPWrapper, localPath: string, remotePath: string, mode: number = 0o660) {
    return new Promise((resolve, reject) => {
      void readFile(localPath).then(async (result: Buffer) => {
        return this.writeFile(sftp, remotePath, result, mode)
          .then(() => {
            resolve(undefined);
          })
          .catch((err) => {
            const msg = `uploadFileUsingExistingSftp: ${err}`;
            this.logger.error(msg);
            reject(new Error(msg));
          });
      });
    });
  }

  private async __uploadDirectory(sftp: SFTPWrapper, localDir: string, remoteDir: string, mode: number = 0o660): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.readdir(localDir, async (err, files) => {
        if (err) {
          return reject(new Error(`ssh.__uploadDir: err ${err}, localDir: ${localDir}, remoteDir: ${remoteDir}`));
        }

        try {
          await this.__createRemoteDirectory(sftp, remoteDir);
          for (const file of files) {
            const localPath = upath.join(localDir, file);
            const remotePath = `${remoteDir}/${file}`;

            if (fs.lstatSync(localPath).isDirectory()) {
              await this.__uploadDirectory(sftp, localPath, remotePath, mode);
            } else {
              await this.uploadFileUsingExistingSftp(sftp, localPath, remotePath, mode);
            }
          }

          resolve();
        } catch (err) {
          const msg = `ssh.__uploadDir: catched err ${err}`;
          this.logger.error(msg);
          reject(new Error(msg));
        }
      });
    });
  }

  /**
   * Uploads a local directory and its contents (including subdirectories) to the remote server via SFTP.
   * @param localDir - The path to the local directory to upload.
   * @param remoteDir - The path to the remote directory on the server.
   * @returns A promise that resolves when the directory and its contents are uploaded.
   */
  public async uploadDirectory(localDir: string, remoteDir: string, mode: number = 0o660): Promise<void> {
    return new Promise((resolve, reject) => {
      void this.withSftp(async (sftp: SFTPWrapper) => {
        try {
          await this.__uploadDirectory(sftp, localDir, remoteDir, mode);
          resolve();
        } catch (e: unknown) {
          reject(new Error(`ssh.uploadDirectory: ${e}`));
        }
      });
    });
  }

  /**
   * Ensures that a remote directory and all its parent directories exist.
   * @param sftp - The SFTP wrapper.
   * @param remotePath - The path to the remote directory.
   * @returns A promise that resolves when the directory is created.
   */
  private __createRemoteDirectory(sftp: SFTPWrapper, remotePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const directories = remotePath.split('/');
      let currentPath = '';

      const createNext = (index: number) => {
        if (index >= directories.length) {
          return resolve();
        }

        currentPath += `${directories[index]}/`;

        sftp.stat(currentPath, (err) => {
          if (err) {
            sftp.mkdir(currentPath, (err) => {
              if (err) {
                return reject(new Error(`ssh.__createRemDir: err ${err}, remotePath: ${remotePath}`));
              }
              createNext(index + 1);
            });
          } else {
            createNext(index + 1);
          }
        });
      };

      createNext(0);
    });
  }

  /**
   * Ensures that a remote directory and all its parent directories exist.
   * @param sftp - The SFTP wrapper.
   * @param remotePath - The path to the remote directory.
   * @returns A promise that resolves when the directory is created.
   */
  public ensureRemoteDirCreated(remotePath: string, mode: number = 0o755): Promise<void> {
    return this.withSftp(async (sftp) => {
      const directories = remotePath.split('/');
      let currentPath = '';

      for (const directory of directories) {
        currentPath += `${directory}/`;

        try {
          await new Promise<void>((resolve, reject) => {
            sftp.stat(currentPath, (err) => {
              if (!err) return resolve();

              sftp.mkdir(currentPath, { mode }, (err) => {
                if (err) {
                  return reject(new Error(`ssh.createRemoteDir: err ${err}, remotePath: ${remotePath}`));
                }
                resolve();
              });
            });
          });
        } catch (error) {
          console.error(`Failed to create directory: ${currentPath}`, error);
          throw error;
        }
      }
    });
  }

  /**
   * Downloads a file from the remote server to a local path via SFTP.
   * @param remotePath - The remote file path on the server.
   * @param localPath - The local file path to save the file.
   * @returns A promise resolving with `true` if the file was successfully downloaded.
   */
  public async downloadFile(remotePath: string, localPath: string): Promise<boolean> {
    return this.withSftp(async (sftp) => {
      return new Promise((resolve, reject) => {
        sftp.fastGet(remotePath, localPath, (err) => {
          if (err) {
            return reject(new Error(`ssh.downloadFile: err ${err}, remotePath: ${remotePath}, localPath: ${localPath}`));
          }
          resolve(true);
        });
      });
    });
  }

  /**
   * Closes the SSH client connection and forwarded ports.
   */
  public close(): void {
    this.closeForwardedPorts();
    this.client.end();
  }
}

export type SshExecResult = { stdout: string; stderr: string };

async function connect(
  client: Client,
  config: ConnectConfig,
  onError: (e: unknown) => void,
  onClose: () => void,
): Promise<Client> {
  return new Promise((resolve, reject) => {
    client.on('ready', () => {
      resolve(client);
    });

    client.on('error', (err: unknown) => {
      onError(err);
      reject(new Error(`ssh.connect: ${err}`));
    });

    client.on('close', () => {
      onClose();
    });

    client.connect(config);

    // Remove TCP buffering.
    // Although it means less throughput (bad), it also means less latency (good).
    // It could help when we have
    // small messages like in our grpc transactions.
    // And it also could help when we have tcp forwarding to not buffer messages in the middle.
    (client as any).setNoDelay(true);
  });
}

async function forwardOut(logger: MiLogger, conn: Client, localHost: string, localPort: number, remoteHost: string, remotePort: number): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    conn.forwardOut(localHost, localPort, remoteHost, remotePort, (err, stream) => {
      if (err) {
        logger.error(`forwardOut.error: ${err}`);
        return reject(err);
      }

      return resolve(stream);
    });
  });
}
