import path from 'path';

export const configLocalYaml = 'config-local.yaml'

export function wdPath(workingDir: string, ...p: string[]): string {
  return path.join(workingDir, ...p);
}
