/** Provides helper functions to work with supervisord */

import type { MiLogger } from '@milaboratories/ts-helpers';
import * as plpath from './pl_paths';
import type { SshClient, SshExecResult } from './ssh';
import { randomBytes } from 'node:crypto';

export async function supervisorCtlStart(
  sshClient: SshClient,
  remoteHome: string, arch: string,
) {
  const result = await supervisorExec(sshClient, remoteHome, arch, '--daemon');

  if (result.stderr) {
    throw new Error(`Can not run ssh Platforma ${result.stderr}`);
  }
}

export async function supervisorStop(
  sshClient: SshClient,
  remoteHome: string, arch: string,
) {
  const result = await supervisorExec(sshClient, remoteHome, arch, 'ctl shutdown');

  if (result.stderr) {
    throw new Error(`Can not stop ssh Platforma ${result.stderr}`);
  }
}

/** Provides a simple true/false response got from supervisord status
 * along with a debug info that could be showed in error logs (raw response from the command, parsed response etc). */
export type SupervisorStatus = {
  platforma?: boolean;
  minio?: boolean;
  rawResult?: SshExecResult;
  execError?: string;
};

export function isAllAlive(status: SupervisorStatus, shouldUseMinio: boolean) {
  if (shouldUseMinio) {
    return status.platforma && status.minio;
  }

  return status.platforma;
}

export function isSupervisordRunning(status: SupervisorStatus) {
  return status.execError === undefined;
}

export async function supervisorStatus(
  logger: MiLogger,
  sshClient: SshClient,
  remoteHome: string, arch: string,
): Promise<SupervisorStatus> {
  let result: SshExecResult;
  try {
    result = await supervisorExec(sshClient, remoteHome, arch, 'ctl status');
  } catch (e: unknown) {
    return { execError: String(e) };
  }

  if (result.stderr) {
    logger.info(`supervisord ctl status: stderr occurred: ${result.stderr}, stdout: ${result.stdout}`);

    return { rawResult: result };
  }

  const platforma = isProgramRunning(result.stdout, 'platforma');
  const minio = isProgramRunning(result.stdout, 'minio');
  const status: SupervisorStatus = {
    rawResult: result,
    platforma,
    minio,
  };

  if (!status.minio) {
    logger.warn('Minio is not running on the server');
  }

  if (!status.platforma) {
    logger.warn('Platforma is not running on the server');
  }

  return status;
}

/** Generates the config for supervisord.
 * docs: https://github.com/ochinchina/supervisord?tab=readme-ov-file#supervised-program-settings
 */
export function generateSupervisordConfig(
  supervisorRemotePort: number,
  remoteWorkDir: string,
  platformaConfigPath: string,
  plPath: string,
) {
  const password = randomBytes(16).toString('hex');
  const freePort = supervisorRemotePort;

  return `
[supervisord]
logfile=${remoteWorkDir}/supervisord.log
loglevel=info
pidfile=${remoteWorkDir}/supervisord.pid

[inet_http_server]
port=127.0.0.1:${freePort}
username=default-user
password=${password}

[supervisorctl]
serverurl=http://127.0.0.1:${freePort}
username=default-user
password=${password}

[program:platforma]
autostart=true
command=${plPath} --config ${platformaConfigPath}
directory=${remoteWorkDir}
autorestart=true
stdout_logfile=${remoteWorkDir}/platforma_cli_logs.log
stdout_logfile_maxbytes=10000
stdout_logfile_backups=10
redirect_stderr=true
`;
}

/** @deprecated, we use minio only on old deployments that existed before we remove minio,
 * for new servers use generation of the config above. */
export function generateSupervisordConfigWithMinio(
  minioStorageDir: string,
  minioEnvs: Record<string, string>,
  supervisorRemotePort: number,
  remoteWorkDir: string,
  platformaConfigPath: string,

  minioPath: string,
  plPath: string,
) {
  const minioEnvStr = Object.entries(minioEnvs).map(([key, value]) => `${key}="${value}"`).join(',');
  const password = randomBytes(16).toString('hex');
  const freePort = supervisorRemotePort;

  return `
[supervisord]
logfile=${remoteWorkDir}/supervisord.log
loglevel=info
pidfile=${remoteWorkDir}/supervisord.pid

[inet_http_server]
port=127.0.0.1:${freePort}
username=default-user
password=${password}

[supervisorctl]
serverurl=http://127.0.0.1:${freePort}
username=default-user
password=${password}

[program:platforma]
autostart=true
depends_on=minio
command=${plPath} --config ${platformaConfigPath}
directory=${remoteWorkDir}
autorestart=true

[program:minio]
autostart=true
environment=${minioEnvStr}
command=${minioPath} server ${minioStorageDir}
directory=${remoteWorkDir}
autorestart=true
`;
}

export async function supervisorExec(
  sshClient: SshClient,
  remoteHome: string, arch: string,
  command: string,
) {
  const supervisorCmd = plpath.supervisorBin(remoteHome, arch);
  const supervisorConf = plpath.supervisorConf(remoteHome);

  const cmd = `${supervisorCmd} --configuration ${supervisorConf} ${command}`;
  return await sshClient.exec(cmd);
}

function isProgramRunning(output: string, programName: string) {
  // eslint-disable-next-line no-control-regex
  const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*m/g, '');

  const cleanedOutput = stripAnsi(output);

  return cleanedOutput.split('\n').some((line) => {
    const [name, status] = line.trim().split(/\s{2,}/); // Split string by 2 spaces.

    return name === programName && status === 'Running';
  });
}
