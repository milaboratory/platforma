import fs from 'fs';
import { spawnSync, SpawnOptions, SpawnSyncReturns, ChildProcess, spawn } from 'child_process';
import state, { dockerRunInfo, processRunInfo } from './state';
import winston from 'winston';

export function runDocker(
  logger: winston.Logger,
  args: readonly string[],
  options: SpawnOptions,
  stateToSave?: dockerRunInfo
) {
  state.lastRun = {
    ...state.lastRun,

    mode: 'docker',
    cmd: 'docker',
    args: args,
    workdir: options.cwd as string,
    envs: options.env,

    docker: {
      ...state.lastRun?.docker,
      ...stateToSave
    }
  };

  return runSync(logger, 'docker', args, options);
}

export function runProcess(
  logger: winston.Logger,
  cmd: string,
  args: readonly string[],
  options: SpawnOptions,
  stateToSave?: processRunInfo
): ChildProcess {
  state.lastRun = {
    ...state.lastRun,

    mode: 'process',
    cmd: cmd,
    args: args,
    workdir: options.cwd as string,
    envs: options.env,

    process: {
      ...state.lastRun?.process,
      ...stateToSave
    }
  };

  const result = run(logger, cmd, args, options);
  state.lastRun.process = {
    ...state.lastRun.process,
    pid: result.pid
  };
  return result;
}

export function rerunLast(logger: winston.Logger, options: SpawnOptions): SpawnSyncReturns<Buffer> {
  if (!state.lastRun) {
    throw new Error('no previous run info found: this is the first run after package installation');
  }

  options = {
    cwd: state.lastRun.workdir,
    env: {
      ...state.lastRun.envs,
      ...options.env
    },
    ...options
  };

  return runSync(logger, state.lastRun.cmd, state.lastRun.args, options);
}

function run(logger: winston.Logger, cmd: string, args: readonly string[], options: SpawnOptions): ChildProcess {
  logger.debug(
    `Running:\n  env: ${JSON.stringify(options.env)}\n  cmd: ${JSON.stringify([cmd, ...args])}\n  wd: ${options.cwd}`
  );

  options.env = { ...process.env, ...options.env };
  logger.debug('  spawning child process');
  const child = spawn(cmd, args, options);
  var exitAfterChild: boolean = false;

  //
  // Ensure Ctrl+C causes right finalization order: first stop child process, then stop the parent.
  //
  const sigintHandler = () => {
    child.kill('SIGINT');
    exitAfterChild = true;
  };

  logger.debug('  setting up signal handler');
  process.on('SIGINT', sigintHandler);

  child.on('close', (code) => {
    process.removeListener('SIGINT', sigintHandler);
    if (exitAfterChild) {
      process.exit(code);
    }
  });

  return child;
}

function runSync(
  logger: winston.Logger,
  cmd: string,
  args: readonly string[],
  options: SpawnOptions
): SpawnSyncReturns<Buffer> {
  logger.debug(
    `Running:\n  env: ${JSON.stringify(options.env)}\n  cmd: ${JSON.stringify([cmd, ...args])}\n  wd: ${options.cwd}`
  );

  options.env = { ...process.env, ...options.env };
  return spawnSync(cmd, args, options);
}
