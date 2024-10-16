import path from 'node:path';

export function validateAbsolute(p: string): string {
  if (!path.isAbsolute(p)) throw new Error(`Path ${p} is not absolute.`);
  return p;
}
