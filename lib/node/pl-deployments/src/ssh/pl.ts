import type * as ssh from 'ssh2';
import { createClient, sshConnect, sshExec } from './ssh';
import { MiLogger } from '@milaboratories/ts-helpers';
import { newDefaultPlBinarySource, PlBinarySource, resolveLocalPlBinaryPath } from '../common/pl_binary';
import { downloadBinary } from '../common/pl_binary_download';

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

/** Options to start ssh pl-backend and minio. */
export type SshPlOptions = {
  /** From what directory start a process. */
  readonly workingDir: string;
  readonly sshConfig: ssh.ConnectConfig;
  /** A string representation of yaml config. */
  readonly config: string;
  /** How to get a binary, download it or get an existing one (default: download latest version) */
  readonly plBinary?: PlBinarySource;

  readonly onClose?: (pl: SshPl) => Promise<void>;
  readonly onError?: (pl: SshPl) => Promise<void>;
  readonly onCloseAndError?: (pl: SshPl) => Promise<void>;
  readonly onCloseAndErrorNoStop?: (pl: SshPl) => Promise<void>;
};

/** Does the following:
 - opens ssh connection
 - checks arch and OS of the remote server
 - downloads pl backend and minio
 - transfers them to the remote server
 - finds free ports there
 - generates config by the given ports
 - transfers all required files and creates required dirs.
 - starts Pl Backend and minio there. */
export async function sshPlatformaInit(
  logger: MiLogger,
  sshClient: ssh.Client,
  _ops: SshPlOptions
): Promise<SshPl> {
  // we'll trace all steps (or "state" of this platforma init process)
  // in this context and print it
  // if something goes wrong.
  const ctx: {
    ops?: SshPlOptions;
    sshConnected?: boolean;
  } = {};

  try {
    ctx.ops = {
      plBinary: newDefaultPlBinarySource(),
      ..._ops
    };

    // opens ssh connection
    await sshConnect(sshClient, ctx.ops.sshConfig);
    ctx.sshConnected = true;

    //

    sshExec(sshClient, 'uname -s');


    // downloadBinary(logger, baseDir, plVersion, arch, platform)
    // 

  } catch (e: any) {
    logger.error(`sshPlatformaInit: something went wrong: ${e}, ctx: ${JSON.stringify(ctx)}`);
  }
}
