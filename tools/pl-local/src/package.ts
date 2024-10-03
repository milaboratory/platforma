import { resolve } from 'path';
import fs from 'fs';

export function path(...p: string[]): string {
  return resolve(__dirname, '..', ...p);
}

export function dist(...p: string[]): string {
  return path('dist', ...p);
}

export function assets(...p: string[]): string {
  return path('assets', ...p);
}

export function readFileSync(...p: string[]): Buffer {
  return fs.readFileSync(path(...p));
}

export type packageJson = {
  'pl-version': string;
};

var _packageJson: packageJson;

export function getPackageJson(): packageJson {
  if (!_packageJson) {
    _packageJson = JSON.parse(readFileSync('package.json').toString());
  }

  return _packageJson;
}

export function plImageTag(version?: string): string {
  if (!version) {
    version = getPackageJson()['pl-version'];
  }

  return `quay.io/milaboratories/platforma:${version}`;
}
