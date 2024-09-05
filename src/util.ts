import os from 'os';
import path from 'path';

import winston from 'winston';
import { randomBytes } from 'crypto';

const readlineSync = require('readline-sync');

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
          .map((line: string, index: number) =>
            index === 0 ? line : indent + line
          )
          .join('\n');

        const colorize = (l: string) =>
          winston.format.colorize().colorize(l, l);

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
