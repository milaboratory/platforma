import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

import winston from 'winston';
import { randomBytes } from 'node:crypto';
import readlineSync from 'readline-sync';

export function askYN(prompt: string): boolean {
  const answer = readlineSync.question(`${prompt} [y/N] `);
  return answer.toLowerCase() === 'y';
}

export function assertNever(n: never) {
  throw new Error('this should never happen');
}

export function createLogger(level: string = 'debug'): winston.Logger {
  return winston.createLogger({
    level: level,

    format: winston.format.printf(({ level, message }) => {
      const indent = ' '.repeat(level.length + 2); // For ': ' after the level
      if (typeof message !== 'string') {
        const messageJson = JSON.stringify(message);
        throw Error(`logger message ${messageJson} is not a string`);
      }
      const indentedMessage = message
        .split('\n')
        .map((line: string, index: number) => (index === 0 ? line : indent + line))
        .join('\n');

      const colorize = (l: string) => winston.format.colorize().colorize(l, l);

      return `${colorize(level)}: ${indentedMessage}`;
    }),

    transports: [
      new winston.transports.Console({
        stderrLevels: ['error', 'warn', 'info', 'debug'],
        handleExceptions: true,
      }),
    ],
  });
}

export function randomStr(len: number): string {
  return randomBytes(Math.ceil(len / 2))
    .toString('hex')
    .slice(0, len);
}

export function resolveTilde(p: string): string {
  if (p.startsWith('~')) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export function ensureDir(p: string, options?: {
  mode?: fs.Mode;
}) {
  if (fs.existsSync(p)) {
    return;
  }

  fs.mkdirSync(p, { recursive: true });
  if (options?.mode) {
    fs.chmodSync(p, options.mode);
  }
}

export function getProcessName(pid: number): string {
  try {
    if (os.platform() !== 'win32') {
      return execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf8' }).trim();
    }

    const command = `wmic process where processid=${pid} get Caption`;
    const lines = execSync(command, { encoding: 'utf8' }).split('\n');

    // lines = ["Caption:", "<process name>"]
    if (lines.length <= 1) {
      return '';
    }

    return lines[1].trim();
  } catch (e) {
    return '';
  }
}

export type dockerComposeStatus = {
  Name: string;
  Status: string;
  ConfigFiles: string;
};

export function getDockerComposeInfo(serviceName: string): dockerComposeStatus | undefined {
  const result = execSync(`docker compose ls --filter name=${serviceName} --format json`, { encoding: 'utf8' }).trim();

  const report = JSON.parse(result) as dockerComposeStatus[];

  for (const st of report) {
    if (st.Name === serviceName) {
      return st;
    }
  }

  return undefined;
}
