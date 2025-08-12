import { resolve } from 'path';
import * as fs from 'fs';
import { getDefaultPlVersion } from '@milaboratories/pl-deployments';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
