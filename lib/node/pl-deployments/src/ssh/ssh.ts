import { ConnectConfig, Client, Connection, ClientChannel } from "ssh2";

/** Promisified exec on ssh connection. */
export function sshExec(client: Client, command: string): Promise<{stdout: string, stderr: string}> {
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

/** Promisified connect function for ssh Client. */
export function sshConnect(client: Client, config: ConnectConfig): Promise<undefined> {
  return new Promise((resolve, reject) => {
    client.on('ready', () => {
      resolve(undefined);
    }).on('error', (err: any) => {
      reject(err);
    }).on('timeout', () => {
      reject(new Error(`timeout was occurred while waiting for SSH connection.`))
    }).connect(config);
  });
}
