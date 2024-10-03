import fs from 'fs';
import { SpawnOptions, ChildProcess, spawn } from 'child_process';
import winston from 'winston';

export function run(
  logger: winston.Logger,
  cmd: string,
  args: readonly string[],
  options: SpawnOptions
): ChildProcess {
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
