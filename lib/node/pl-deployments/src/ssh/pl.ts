import type * as ssh from 'ssh2';

export class SshPl {
  constructor(
    public readonly sshClient: ssh.Client,
  ) {}

  public async isAlive() {
    return true;
  }

  public async start() {
    return;
  }

  public async stop() {
    return;
  }
}
