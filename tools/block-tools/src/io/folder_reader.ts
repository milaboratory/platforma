import { Agent, Dispatcher, request } from 'undici';
import { RelativeContentReader } from '../v2';
import path from 'node:path';
import pathPosix from 'node:path/posix';
import fsp from 'node:fs/promises';

export interface FolderReader {
  relativeReader(relativePath: string): FolderReader;
  readFile(file: string): Promise<Buffer>;
  getContentReader(relativePath?: string): RelativeContentReader;
}

export class HttpFolderReader implements FolderReader {
  constructor(
    private readonly root: URL,
    private readonly httpDispatcher: Dispatcher
  ) {}

  public async readFile(file: string): Promise<Buffer> {
    const targetUrl = new URL(file, this.root);
    const response = await request(targetUrl, {
      dispatcher: this.httpDispatcher
    });
    return Buffer.from(await response.body.arrayBuffer());
  }

  public relativeReader(relativePath: string): HttpFolderReader {
    return new HttpFolderReader(new URL(this.root, relativePath), this.httpDispatcher);
  }

  public getContentReader(relativePath?: string): RelativeContentReader {
    let reader: HttpFolderReader = this;
    if (relativePath !== undefined) reader = reader.relativeReader(relativePath);
    return (path) => reader.readFile(path);
  }
}

export class FSFolderReader implements FolderReader {
  constructor(private readonly root: string) {}

  public async readFile(file: string): Promise<Buffer> {
    const targetPath = path.join(this.root, ...file.split(pathPosix.sep));
    return await fsp.readFile(targetPath);
  }

  public relativeReader(relativePath: string): FSFolderReader {
    return new FSFolderReader(path.join(this.root, ...relativePath.split(pathPosix.sep)));
  }

  public getContentReader(relativePath?: string): RelativeContentReader {
    let reader: FSFolderReader = this;
    if (relativePath !== undefined) reader = reader.relativeReader(relativePath);
    return (path) => reader.readFile(path);
  }
}

function posixToLocalPath(p: string): string {
  return p.split(pathPosix.sep).join(path.sep);
}

function localToPosix(p: string): string {
  return p.split(path.sep).join(pathPosix.sep);
}

export function folderReaderByUrl(address: string, httpDispatcher?: Dispatcher): FolderReader {
  const url = new URL(address, `file:${localToPosix(path.resolve('.'))}/`);
  switch (url.protocol) {
    case 'file:':
      const root = posixToLocalPath(url.pathname);
      return new FSFolderReader(root);
    case 'https:':
    case 'http:':
      return new HttpFolderReader(url, httpDispatcher ?? new Agent());
    default:
      throw new Error(`Unknown protocol: ${url.protocol}`);
  }
}
