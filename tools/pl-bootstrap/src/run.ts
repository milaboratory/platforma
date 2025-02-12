import type { SpawnOptions, SpawnSyncReturns, ChildProcess } from 'node:child_process';
import { spawnSync, spawn } from 'node:child_process';
import type { instanceCommand } from './state';
import state from './state';
import type winston from 'winston';

type runResult = {
  executed: SpawnSyncReturns<Buffer>[];
  spawned: ChildProcess[];
};

export function runCommands(logger: winston.Logger, cmds: instanceCommand[], options?: SpawnOptions): runResult {
  const buffers: SpawnSyncReturns<Buffer>[] = [];
  const children: ChildProcess[] = [];
  for (const cmd of cmds) {
    const opts = {
      cwd: cmd.workdir,
      env: {
        ...cmd.envs,
        ...options?.env,
      },
      ...cmd.runOpts,
      ...options,
    };

    if (cmd.async) {
      const child = run(logger, cmd.cmd, cmd.args, opts);
      children.push(child);
    } else {
      const result = runSync(logger, cmd.cmd, cmd.args, opts);
      buffers.push(result);
      if (result.error || result.status !== 0) {
        break;
      }
    }
  };

  return {
    executed: buffers,
    spawned: children,
  };
}

export function rerunLast(logger: winston.Logger, options: SpawnOptions): runResult {
  const instance = state.currentInstance;

  if (!instance) {
    throw new Error('no previous run info found: this is the first run after package installation');
  }

  return runCommands(logger, instance.upCommands, options);
}

export function run(logger: winston.Logger, cmd: string, args: readonly string[], options: SpawnOptions): ChildProcess {
  logger.debug(
    `Running:\n  env: ${JSON.stringify(options.env)}\n  cmd: ${JSON.stringify([cmd, ...args])}\n  wd: ${options.cwd?.toString()}`,
  );

  options.env = { ...process.env, ...options.env };
  logger.debug('  spawning child process');
  const child = spawn(cmd, args, options);
  let exitAfterChild: boolean = false;

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

export function runSync(
  logger: winston.Logger,
  cmd: string,
  args: readonly string[],
  options: SpawnOptions,
): SpawnSyncReturns<Buffer> {
  logger.debug(
    `Running:\n  cmd: ${JSON.stringify([cmd, ...args])}\n  opts: ${JSON.stringify(options)}`,
  );

  options.env = { ...process.env, ...options.env };
  return spawnSync(cmd, args, options);
}
