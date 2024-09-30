import { Agent, Dispatcher, request } from 'undici';
import { RelativeContentReader } from '../v2';
import path from 'node:path';
import pathPosix from 'node:path/posix';
import fsp from 'node:fs/promises';

export interface FolderReader {
  readonly rootUrl: URL;
  relativeReader(relativePath: string): FolderReader;
  readFile(file: string): Promise<Buffer>;
  getContentReader(relativePath?: string): RelativeContentReader;
}

class HttpFolderReader implements FolderReader {
  constructor(
    public readonly rootUrl: URL,
    private readonly httpDispatcher: Dispatcher
  ) {}

  public async readFile(file: string): Promise<Buffer> {
    const targetUrl = new URL(file, this.rootUrl);
    const response = await request(targetUrl, {
      dispatcher: this.httpDispatcher
    });
    return Buffer.from(await response.body.arrayBuffer());
  }

  public relativeReader(relativePath: string): HttpFolderReader {
    if (!relativePath.endsWith('/')) relativePath = relativePath + '/';
    return new HttpFolderReader(new URL(relativePath, this.rootUrl), this.httpDispatcher);
  }

  public getContentReader(relativePath?: string): RelativeContentReader {
    let reader: HttpFolderReader = this;
    if (relativePath !== undefined) reader = reader.relativeReader(relativePath);
    return (path) => reader.readFile(path);
  }
}

class FSFolderReader implements FolderReader {
  constructor(
    public readonly rootUrl: URL,
    private readonly root: string
  ) {}

  public async readFile(file: string): Promise<Buffer> {
    const targetPath = path.join(this.root, ...file.split(pathPosix.sep));
    return await fsp.readFile(targetPath);
  }

  public relativeReader(relativePath: string): FSFolderReader {
    if (!relativePath.endsWith('/')) relativePath = relativePath + '/';
    return new FSFolderReader(
      new URL(relativePath, this.rootUrl),
      path.join(this.root, ...relativePath.split(pathPosix.sep))
    );
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
  if (!address.endsWith('/')) address = address + '/';
  const url = new URL(address, `file:${localToPosix(path.resolve('.'))}/`);
  switch (url.protocol) {
    case 'file:':
      const rootPath = posixToLocalPath(url.pathname);
      return new FSFolderReader(url, rootPath);
    case 'https:':
    case 'http:':
      return new HttpFolderReader(url, httpDispatcher ?? new Agent());
    default:
      throw new Error(`Unknown protocol: ${url.protocol}`);
  }
}
