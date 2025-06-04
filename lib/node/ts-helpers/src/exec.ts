import type { SpawnOptions } from 'node:child_process';
import { spawn } from 'node:child_process';

export interface SpawnAsyncResult {
  stdout: string;
  stderr: string;
}

/** An async version of `spawn` that returns the stdout and stderr of the process. */
export function spawnAsync(cmd: string, args: string[], opts: SpawnOptions): Promise<SpawnAsyncResult> {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(cmd, args, opts);
    let stdout = '';
    let stderr = '';

    childProcess.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    childProcess.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    childProcess.on('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Process exited with code ${code}. Stderr: ${stderr}`));
      }
    });

    childProcess.on('error', (err) => {
      reject(err);
    });
  });
}
