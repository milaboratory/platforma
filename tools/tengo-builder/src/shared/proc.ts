import type { ChildProcess, ChildProcessByStdio } from 'node:child_process';
import { spawn } from 'node:child_process';
import type { Writable } from 'node:stream';

export function spawnEmbed(
  cmd: string,
  ...args: string[]
): ChildProcessByStdio<Writable, null, null> {
  const p = spawn(cmd, args, { stdio: ['pipe', 'inherit', 'inherit'] });

  p.stdin.on('error', (err: Error) => {
    const systemError = err as NodeJS.ErrnoException;
    if (systemError.code === 'EPIPE') {
      // ignore EPIPE error as it stands for broken command run.
      // The command will write normal problem description by itself.
    }
  });

  return p;
}

export function waitFor(p: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    p.on('close', (code: number) => {
      resolve(code);
    });
    p.on('error', (err) => {
      reject(err);
    });
  });
}
