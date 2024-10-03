import path from 'path';

export function wdPath(workingDir: string, ...p: string[]): string {
  return path.join(workingDir, ...p);
}
