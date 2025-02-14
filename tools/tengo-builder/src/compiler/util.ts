import * as fs from 'node:fs';
import * as path from 'node:path';
import * as winston from 'winston';

export function assertNever(x: never): never {
  // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
  throw new Error('Unexpected object: ' + x);
}

export function createLogger(level: string = 'debug'): winston.Logger {
  return winston.createLogger({
    level: level,
    format: winston.format.printf(({ level, message }) => {
      return `${level.padStart(6, ' ')}: ${message as string}`;
    }),
    transports: [
      new winston.transports.Console({
        stderrLevels: ['error', 'warn', 'info', 'debug'],
        handleExceptions: true,
      }),
    ],
  });
}

export function findNodeModules(): string {
  let currentDir = process.cwd();

  while (currentDir) {
    const possibleNodeModulesPath = path.join(currentDir, 'node_modules');

    if (fs.existsSync(possibleNodeModulesPath)) return possibleNodeModulesPath;

    const parentDir = path.resolve(currentDir, '..');
    if (parentDir === currentDir) break; // reached the root directory

    currentDir = parentDir;
  }

  throw new Error('Unable to find node_modules directory.');
}

export type PathType = 'absent' | 'file' | 'dir' | 'link' | 'unknown';

export function pathType(path: string): PathType {
  try {
    const s = fs.statSync(path);
    if (s.isDirectory()) return 'dir';
    if (s.isFile()) return 'file';
    if (s.isSymbolicLink()) return 'link';
    return 'unknown';
  } catch (error: unknown) {
    const err = error as NodeJS.ErrnoException;
    if (err.code == 'ENOENT') return 'absent';
    else throw err;
  }
}

export function isUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid.toLowerCase());
}
