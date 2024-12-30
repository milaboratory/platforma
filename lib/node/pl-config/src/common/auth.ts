import fs from 'fs/promises';
import path from 'path';
import type { PlAuthDriver } from './types';
import { randomBytes } from 'crypto';

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

export function getDefaultAuthMethods(htpasswdAuth: string, jwtKey: string): PlAuthDriver[] {
  return [
    {
      driver: 'jwt',
      key: jwtKey,
    },
    {
      driver: 'htpasswd',
      path: htpasswdAuth,
    },
  ];
}

export function randomStr(len: number): string {
  return randomBytes(Math.ceil(len / 2))
    .toString('hex')
    .slice(0, len);
}
