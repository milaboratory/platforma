import type { ConnectConfig, ClientChannel, SFTPWrapper } from 'ssh2';
import ssh, { Client } from 'ssh2';
import net from 'net';
import dns from 'dns';
import fs from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';

export type SshAuthMethods = 'publickey' | 'password';
export type SshAuthMethodsResult = SshAuthMethods[];

export class SshClient {
  private client: Client = new Client();
  private config?: ConnectConfig;
  public homeDir?: string;

  /**
   * Initializes the SshClient and establishes a connection using the provided configuration.
   * @param config - The connection configuration object for the SSH client.
   * @returns A new instance of SshClient with an active connection.
   */
  public static async init(config: ConnectConfig): Promise<SshClient> {
    const client = new SshClient();
    await client.connect(config);
    await client.getUserHomeDirectory();
    return client;
  }

  public async getUserHomeDirectory() {
    if (this.homeDir) {
      return this.homeDir;
    }
    const { stdout, stderr } = await this.exec('echo $HOME');
    if (stderr) {
      console.warn('Can not get user home directory');
      return `/home/${this.config?.username}`;
    }
    this.homeDir = stdout.trim();
    return this.homeDir;
  }

  /**
   * Connects to the SSH server using the specified configuration.
   * @param config - The connection configuration object for the SSH client.
   * @returns A promise that resolves when the connection is established or rejects on error.
   */
  public async connect(config: ConnectConfig) {
    this.config = config;
    return new Promise((resolve, reject) => {
      this.client.on('ready', () => {
        resolve(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }).on('error', (err: any) => {
        reject(err);
      }).on('timeout', () => {
        reject(new Error(`timeout was occurred while waiting for SSH connection.`));
      }).connect(config);
    });
  }

  /**
   * Executes a command on the SSH server.
   * @param command - The command to execute on the remote server.
   * @returns A promise resolving with the command's stdout and stderr outputs.
   */
  public async exec(command: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.client.exec(command, (err: any, stream: ClientChannel) => {
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
    config = config ?? this.config;
    return new Promise((resolve, reject) => {
      if (!config) {
        reject('No config defined');
        return;
      }
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
        reject(err);
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
    return this.withSftp(async (sftp) => {
      return new Promise((resolve, reject) => {
        sftp.fastPut(localPath, remotePath, (err) => {
          if (err) return reject(err);
          resolve(true);
        });
      });
    });
  }

  delay(delay: number): Promise<void> {
    return new Promise((res, rej) => {
      setTimeout(() => res(), delay);
    });
  }

  public async withSftp<R>(callback: (sftp: SFTPWrapper) => Promise<R>): Promise<R> {
    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) {
          return reject(err);
        }

        callback(sftp)
          .then(resolve)
          .catch(reject)
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

  public async readFile(remotePath: string): Promise<string> {
    return this.withSftp(async (sftp) => {
      return new Promise((resolve, reject) => {
        sftp.readFile(remotePath, (err, buffer) => {
          if (err) {
            return reject(err);
          }
          resolve(buffer.toString());
        });
      });
    });
  }

  async checkFileExists(remotePath: string) {
    return this.withSftp(async (sftp) => {
      return new Promise((resolve, reject) => {
        sftp.stat(remotePath, (err, stats) => {
          if (err) {
            if ((err as Error & { code: number }).code === 2) {
              return resolve(false);
            }
            return reject(err);
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
            return reject(err);
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
        if (err) return reject(err);
        resolve(true);
      });
    });
  }

  public uploadFileUsingExistingSftp(sftp: SFTPWrapper, localPath: string, remotePath: string, mode: number = 0o660) {
    return new Promise((resolve, reject) => {
      readFile(localPath).then(async (result) => {
        this.writeFile(sftp, remotePath, result, mode)
          .then(() => {
            resolve(undefined);
          })
          .catch((err) => reject(err));
      });
    });
  }

  private async __uploadDirectory(sftp: SFTPWrapper, localDir: string, remoteDir: string, mode: number = 0o660): Promise<void> {
    return new Promise((resolve, reject) => {
      fs.readdir(localDir, async (err, files) => {
        if (err) {
          return reject(err);
        }

        try {
          await this.__createRemoteDirectory(sftp, remoteDir);

          for (const file of files) {
            const localPath = path.join(localDir, file);
            const remotePath = `${remoteDir}/${file}`;

            if (fs.lstatSync(localPath).isDirectory()) {
              await this.__uploadDirectory(sftp, localPath, remotePath, mode);
            } else {
              await this.uploadFileUsingExistingSftp(sftp, localPath, remotePath, mode);
              // console.log(`Uploaded file: ${localPath} -> ${remotePath}`);
            }
          }

          resolve();
        } catch (err) {
          reject(err);
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
      this.withSftp(async (sftp: SFTPWrapper) => {
        await this.__uploadDirectory(sftp, localDir, remoteDir, mode);
        resolve();
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
              if (err) return reject(err);
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
  public createRemoteDirectory(remotePath: string, mode: number = 0o755): Promise<void> {
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
                if (err) return reject(err);
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
          if (err) return reject(err);
          resolve(true);
        });
      });
    });
  }

  /**
   * Closes the SSH client connection.
   */
  public close(): void {
    this.client.end();
  }
}
