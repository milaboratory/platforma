import fs from 'node:fs/promises';
import upath from 'upath';
import type { PlAuthDriver } from './types';

/** A line in a users.htpasswd config */
export interface HtpasswdLine {
  user: string;
  password: string;
}

/** Config is just an array of lines. */
export type HtpasswdConfig = HtpasswdLine[];

/** Where a default config should be stored and a stringified content of the config. */
export type Htpasswd = {
  filePath: string;
  content: string;
};

/** Writes a config to the local storage. */
export async function createLocalHtpasswdFile(dir: string, config: HtpasswdConfig) {
  const result = newHtpasswdFile(dir, config);
  await fs.writeFile(result.filePath, result.content);

  return result.filePath;
}

export function newHtpasswdFile(dir: string, config: HtpasswdConfig): Htpasswd {
  return {
    filePath: upath.join(dir, 'users.htpasswd'),
    content: stringifyHtpasswdConfig(config),
  };
}

export function stringifyHtpasswdConfig(lines: HtpasswdConfig): string {
  return lines.map((line) => `${line.user}:${line.password}`).join('\n');
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
