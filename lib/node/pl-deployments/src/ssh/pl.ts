import type * as ssh from 'ssh2';
import { createClient } from './ssh';

export class SshPl {
  constructor(
    public readonly sshClient: ssh.Client,
  ) {}

  public static init() {
    return new SshPl(createClient());
  }

  public async isAlive() {
    return true;
  }

  public async fetchPorts() {
    // FIXME need implementation
    return {
      grpc: 42097,
      monitoring: 39841,
      debug: 37659,
      minioPort: 9000,
      minioConsolePort: 9001,
    };
  }

  public async start() {
    return;
  }

  public async stop() {
    return;
  }
}
