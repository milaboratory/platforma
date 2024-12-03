import pathPosix from 'node:path/posix';
import path from 'node:path';
import { paginateListObjectsV2, S3 } from '@aws-sdk/client-s3';
import * as fs from 'node:fs';

export interface RegistryStorage {
  putFile(file: string, buffer: Buffer): Promise<void>;

  getFile(file: string): Promise<Buffer | undefined>;

  listFiles(prefix: string): Promise<string[]>;

  deleteFiles(...files: string[]): Promise<void>;
}

export class S3Storage implements RegistryStorage {
  constructor(
    public readonly client: S3,
    public readonly bucket: string,
    public readonly root: string
  ) {}

  async getFile(file: string): Promise<Buffer | undefined> {
    try {
      return Buffer.from(
        await (
          await this.client.getObject({
            Bucket: this.bucket,
            Key: pathPosix.join(this.root, file)
          })
        ).Body!.transformToByteArray()
      );
    } catch (e: any) {
      if (e.name === 'NoSuchKey') return undefined;
      else throw e;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    const listRoot = pathPosix.join(this.root, prefix);
    const paginator = paginateListObjectsV2(
      { client: this.client },
      {
        Bucket: this.bucket,
        Prefix: listRoot
      }
    );
    const result: string[] = [];
    for await (const page of paginator)
      result.push(...(page.Contents ?? []).map((e) => pathPosix.relative(listRoot, e.Key!)));
    return result;
  }

  async putFile(file: string, buffer: Buffer): Promise<void> {
    await this.client.putObject({
      Bucket: this.bucket,
      Key: pathPosix.join(this.root, file),
      Body: buffer
    });
  }

  async deleteFiles(...files: string[]): Promise<void> {
    // TODO implement support of more than 1000 files
    const results = await this.client.deleteObjects({
      Bucket: this.bucket,
      Delete: {
        Objects: files.map((file) => ({
          Key: pathPosix.join(this.root, file)
        }))
      }
    });
    if (results.Errors !== undefined && results.Errors.length > 0)
      throw new Error(`Errors encountered while deleting files: ${results.Errors.join('\n')}`);
  }
}

export class FSStorage implements RegistryStorage {
  /** Absolute path */
  public readonly root: string;

  constructor(_root: string) {
    this.root = path.resolve(_root);
  }

  private toAbsolutePath(localPath: string): string {
    if (pathPosix.isAbsolute(localPath)) throw new Error('absolute path');
    return path.resolve(this.root, localPath.split(pathPosix.sep).join(path.sep));
  }

  async getFile(address: string): Promise<Buffer | undefined> {
    try {
      return await fs.promises.readFile(this.toAbsolutePath(address));
    } catch (err: any) {
      if (err.code == 'ENOENT') return undefined;
      else throw new Error('', { cause: err });
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    try {
      const listRoot = this.toAbsolutePath(prefix);
      return (await fs.promises.readdir(listRoot, { recursive: true, withFileTypes: true }))
        .filter((e) => e.isFile())
        .map((e) =>
          path.relative(listRoot, path.resolve(e.path, e.name)).split(path.sep).join(pathPosix.sep)
        );
    } catch (err: any) {
      if (err.code == 'ENOENT') return [];
      else throw new Error('', { cause: err });
    }
  }

  async putFile(address: string, buffer: Buffer): Promise<void> {
    const absoluteAddress = this.toAbsolutePath(address);
    await fs.promises.mkdir(path.dirname(absoluteAddress), { recursive: true });
    await fs.promises.writeFile(absoluteAddress, buffer);
  }

  async deleteFiles(...files: string[]): Promise<void> {
    // Folders are not removed, deletes issued sequentially
    for (const file of files) await fs.promises.rm(this.toAbsolutePath(file));
  }
}

export function storageByUrl(address: string): RegistryStorage {
  const url = new URL(address, `file:${path.resolve('.').split(path.sep).join(pathPosix.sep)}/`);
  switch (url.protocol) {
    case 'file:':
      const root = path.resolve(url.pathname);
      return new FSStorage(root);
    case 's3:':
      const options: NonNullable<ConstructorParameters<typeof S3>[0]> = {};
      const region = url.searchParams.get('region');
      if (region) options.region = region;
      const bucket = url.hostname;
      return new S3Storage(new S3(options), bucket, url.pathname.replace(/^\//, ''));
    default:
      throw new Error(`Unknown protocol: ${url.protocol}`);
  }
}
