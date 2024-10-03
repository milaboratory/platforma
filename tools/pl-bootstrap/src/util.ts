import os from 'os';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

import winston from 'winston';
import { randomBytes } from 'crypto';
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

    format: winston.format.combine(
      winston.format.printf(({ level, message }) => {
        const indent = ' '.repeat(level.length + 2); // For ': ' after the level
        const indentedMessage = message
          .split('\n')
          .map((line: string, index: number) => (index === 0 ? line : indent + line))
          .join('\n');

        const colorize = (l: string) => winston.format.colorize().colorize(l, l);

        return `${colorize(level)}: ${indentedMessage}`;
      })
    ),

    transports: [
      new winston.transports.Console({
        stderrLevels: ['error', 'warn', 'info', 'debug'],
        handleExceptions: true
      })
    ]
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

export function ensureDir(p: string) {
  if (fs.existsSync(p)) {
    return
  }

  fs.mkdirSync(p, {recursive: true})
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
