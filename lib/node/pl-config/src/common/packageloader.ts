import fs from 'fs/promises';
import path from 'path';

export async function createDefaultPackageSettings(dir: string) {
  const fPath = 'packages';
  await fs.mkdir(path.join(dir, fPath), { recursive: true });

  return fPath;
}
