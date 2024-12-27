import { resolve, join } from 'path';
import fs from 'fs';
import { getDefaultPlVersion } from '@milaboratories/pl-deployments';

export function path(...p: string[]): string {
  return resolve(__dirname, '..', ...p);
}

export function dist(...p: string[]): string {
  return path('dist', ...p);
}

export function assets(...p: string[]): string {
  return path('assets', ...p);
}

export function composeFiles(): string[] {
  const dockerDirEntries = fs.readdirSync(assets());
  return dockerDirEntries
    .filter((entry) => {
      return entry.startsWith('compose-') && entry.endsWith('.yaml');
    })
    .map((value) => assets(value));
}

export function readFileSync(...p: string[]): Buffer {
  return fs.readFileSync(path(...p));
}

export function plImageTag(version?: string): string {
  if (!version) {
    version = getDefaultPlVersion();
  }

  return `quay.io/milaboratories/platforma:${version}`;
}
