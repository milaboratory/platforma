import { spawn, ChildProcess, ChildProcessByStdio } from 'child_process';
import { Writable } from 'stream';

export function spawnEmbed(cmd : string, ...args : string[]) : ChildProcessByStdio<Writable, null, null> {
    const p = spawn(
        cmd, args,
        { stdio: ['pipe', process.stdout, process.stderr] }
    );
  
    p.stdin.on('error', (err: any) => {
    if (err.code === 'EPIPE') {
        // ignore EPIPE error as it stands for broken command run. 
        // The command will write normal problem description by itself.
    }
    });
  
    return p
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
