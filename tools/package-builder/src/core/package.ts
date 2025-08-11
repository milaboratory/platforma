import { resolve } from 'node:path';

export function path(...p: string[]): string {
  return resolve(__dirname, '..', ...p);
}

export function assets(...p: string[]): string {
  return path('assets', ...p);
}
