import fs from 'fs';
import { SpawnOptions, ChildProcess, spawn } from 'child_process';
import { MiLogger } from '@milaboratories/ts-helpers';

export function run(
  logger: MiLogger,
  cmd: string,
  args: readonly string[],
  options: SpawnOptions
): ChildProcess {
  logger.info(`Running:
env: ${JSON.stringify(options.env)}
cmd: ${JSON.stringify([cmd, ...args])}
wd: ${options.cwd}`);

  logger.info('  spawning child process');
  const child = spawn(cmd, args, options);
  var exitAfterChild: boolean = false;

  //
  // Ensure Ctrl+C causes right finalization order: first stop child process, then stop the parent.
  //
  const sigintHandler = () => {
    child.kill('SIGINT');
    exitAfterChild = true;
  };

  logger.info('  setting up signal handler');
  process.on('SIGINT', sigintHandler);

  child.on('close', (code) => {
    process.removeListener('SIGINT', sigintHandler);
    if (exitAfterChild) {
      process.exit(code);
    }
  });

  return child;
}
