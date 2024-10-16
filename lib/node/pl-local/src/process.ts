import { SpawnOptions, ChildProcess, spawn } from 'child_process';
import { MiLogger, sleep } from '@milaboratories/ts-helpers';

export type ProcessOptions = {
  cmd: string;
  args: string[];
  opts: SpawnOptions;
};

export function processRun(logger: MiLogger, opts: ProcessOptions): ChildProcess {
  logger.info(`Running:
cmd: ${JSON.stringify([opts.cmd, ...opts.args])}
wd: ${opts.opts.cwd}`);

  logger.info('  spawning child process');
  return spawn(opts.cmd, opts.args, opts.opts);
}

export async function isProcessAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

export function processStop(pid: number) {
  return process.kill(pid, 'SIGINT');
}

export async function processWaitStopped(pid: number, maxMs: number) {
  const sleepMs = 100;
  let total = 0;
  while (await isProcessAlive(pid)) {
    await sleep(sleepMs);
    total += sleepMs;
    if (total > maxMs) {
      throw new Error(`The process did not stopped after ${maxMs} ms.`);
    }
  }
}
