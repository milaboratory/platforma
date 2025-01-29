import fs from 'fs/promises';
import upath from 'upath';

/** Gets a default software loader path and creates it locally. */
export async function createDefaultLocalPackageSettings(dir: string) {
  const fPath = newDefaultPackageSettings(dir);
  await fs.mkdir(fPath, { recursive: true });

  return fPath;
}

export function newDefaultPackageSettings(dir: string) {
  return upath.join(dir, 'packages');
}
