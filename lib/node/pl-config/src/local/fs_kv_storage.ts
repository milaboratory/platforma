import upath from 'upath';
import * as fsp from 'node:fs/promises';

export class FSKVStorage {
  private constructor(private readonly root: string) {}

  public async getOrCreate(
    key: string,
    generator: () => Promise<string> | string,
  ): Promise<string> {
    const fullPath = upath.join(this.root, key);
    try {
      return await fsp.readFile(fullPath, { encoding: 'utf8' });
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        const value = await generator();
        const tmp = fullPath + '.tmp';
        await fsp.writeFile(tmp, value);
        await fsp.rename(tmp, fullPath);
        return value;
      } else throw err;
    }
  }

  public static async init(folder: string): Promise<FSKVStorage> {
    const root = upath.resolve(folder);
    await fsp.mkdir(root, { recursive: true });
    return new FSKVStorage(root);
  }
}
