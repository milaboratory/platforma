import fs from 'node:fs';

export async function tryLoadFile<T>(
  file: string,
  map: (buf: Buffer) => T
): Promise<T | undefined> {
  try {
    return map(await fs.promises.readFile(file));
  } catch (err: any) {
    if (err.code == 'ENOENT') return undefined;
    else throw new Error('', { cause: err });
  }
}
