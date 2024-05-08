import * as fs from 'node:fs';
import * as path from 'node:path';

export function assertNever(x: never): never {
  throw new Error('Unexpected object: ' + x);
}

export function findNodeModules() : string {
  let currentDir = process.cwd();

  while (currentDir) {
    const possibleNodeModulesPath = path.join(currentDir, 'node_modules');

    if (fs.existsSync(possibleNodeModulesPath)) {
      return possibleNodeModulesPath;
    }

    const parentDir = path.resolve(currentDir, '..');
    if (parentDir === currentDir) {
      break; // reached the root directory
    }
    currentDir = parentDir;
  }

  throw new Error('Unable to find node_modules directory.');
}

export type PathType = 'absent' | 'file' | 'dir' | 'unknown'

export function pathType(path: string): PathType {
  try {
    const s = fs.statSync(path);
    if (s.isDirectory())
      return 'dir';
    if (s.isFile())
      return 'file';
    return 'unknown';
  } catch (err: any) {
    if (err.code == 'ENOENT')
      return 'absent';
    else
      throw err;
  }
}
