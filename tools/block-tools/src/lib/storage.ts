import pathPosix from 'node:path/posix';
import path from 'node:path';
import * as fs from 'node:fs';
import { paginateListObjectsV2, S3 } from '@aws-sdk/client-s3';
import { se_PutBucketAccelerateConfigurationCommand } from '@aws-sdk/client-s3/dist-types/protocols/Aws_restXml';

export interface RegistryStorage {
  putFile(address: string, buffer: Buffer): Promise<void>;

  getFile(address: string): Promise<Buffer | undefined>;

  listFiles(prefix: string): Promise<string[]>;
}

export class S3Storage implements RegistryStorage {
  constructor(public readonly client: S3,
              public readonly bucket: string,
              public readonly root: string) {
  }

  async getFile(address: string): Promise<Buffer | undefined> {
    try {
      return Buffer.from(await (await this.client.getObject({
        Bucket: this.bucket,
        Key: pathPosix.join(this.root, address)
      })).Body!.transformToByteArray());
    } catch (e: any) {
      if (e.name === 'NoSuchKey')
        return undefined;
      else
        throw e;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    const listRoot = pathPosix.join(this.root, prefix);
    const paginator = paginateListObjectsV2({ client: this.client }, {
      Bucket: this.bucket,
      Prefix: listRoot
    });
    const result: string[] = [];
    for await (const page of paginator)
      result.push(...(page.Contents!.map(e => pathPosix.relative(listRoot, e.Key!))));
    return result;
  }

  async putFile(address: string, buffer: Buffer): Promise<void> {
    await this.client.putObject({ Bucket: this.bucket, Key: pathPosix.join(this.root, address), Body: buffer });
  }
}

export class FSStorage implements RegistryStorage {
  public readonly root: string;

  constructor(_root: string) {
    this.root = path.resolve(_root);
  }

  private toAbsolutePath(localPath: string): string {
    if (pathPosix.isAbsolute(localPath))
      throw new Error('absolute path');
    return path.resolve(this.root, localPath.split(pathPosix.sep).join(path.sep));
  }

  async getFile(address: string): Promise<Buffer | undefined> {
    try {
      return await fs.promises.readFile(this.toAbsolutePath(address));
    } catch (err: any) {
      if (err.code == 'ENOENT')
        return undefined;
      else
        throw err;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    const listRoot = this.toAbsolutePath(prefix);
    return (await fs.promises.readdir(listRoot, { recursive: true, withFileTypes: true }))
      .filter(e => e.isFile())
      .map(e => path.relative(listRoot, path.resolve(e.path, e.name))
        .split(path.sep).join(pathPosix.sep));
  }

  async putFile(address: string, buffer: Buffer): Promise<void> {
    const absoluteAddress = this.toAbsolutePath(address);
    await fs.promises.mkdir(path.dirname(absoluteAddress), { recursive: true });
    await fs.promises.writeFile(absoluteAddress, buffer);
  }
}

export function storageByUrl(address: string): RegistryStorage {
  const url = new URL(address);
  switch (url.protocol) {
    case 'file:':
      const root = path.resolve(url.pathname);
      return new FSStorage(root);
    case 's3:':
      const options: NonNullable<ConstructorParameters<typeof S3>[0]> = {};
      const region = url.searchParams.get('region');
      if (region)
        options.region = region;
      const bucket = url.hostname;
      return new S3Storage(new S3(options), bucket, url.pathname.replace(/^\//, ''));
    default:
      throw new Error(`Unknown protocol: ${url.protocol}`);
  }
}
