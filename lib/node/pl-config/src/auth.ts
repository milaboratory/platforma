import fs from 'fs/promises';
import path from 'path';

export interface HtpasswdLine {
  user: string;
  password: string;
}

export type HtpasswdConfig = HtpasswdLine[];

export function stringifyHtpasswdConfig(c: HtpasswdConfig): string {
  return c.map((line) => `${line.user}:${line.password}`).join('\n');
}

export async function createHtpasswdFile(dir: string, config: HtpasswdConfig) {
  const fPath = 'users.htpasswd';
  await fs.writeFile(path.join(dir, fPath), stringifyHtpasswdConfig(config));

  return fPath;
}
