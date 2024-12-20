import { z } from 'zod';
import path from 'path';
import fsp from 'node:fs/promises';
import * as mime from 'mime-types';
import * as tar from 'tar';
import {
  ContentAbsoluteBinaryLocal,
  ContentAbsoluteFile,
  ContentAbsoluteFolder,
  ContentAbsoluteTextLocal,
  ContentAnyLocal,
  ContentExplicitBase64,
  ContentExplicitBytes,
  ContentExplicitString,
  ContentRelative,
  ContentRelativeBinary,
  ContentRelativeText
} from '@milaboratories/pl-model-middle-layer';
import { tryResolve } from '@milaboratories/resolve-helper';

type ContentCtxFs = {
  type: 'local';
  /** Folder relative to which content should be resolved */
  path: string;
};

type ContentCtxUrl = {
  type: 'remote';
  /** URL prefix from which content should be resolved */
  url: string;
};

/** Describes a place relative to which any content references should be interpreted */
export type ContentCtx = ContentCtxFs | ContentCtxUrl;

function mustResolve(root: string, request: string): string {
  const res = tryResolve(root, request);
  if (res === undefined) throw new Error(`Can't resolve ${request} against ${root}`);
  return res;
}

/** Zod type that resolves node module request into absolute content */
export function ResolvedModuleFile(moduleRoot: string) {
  return z.string().transform<ContentAbsoluteFile>((request, ctx) => {
    const result = tryResolve(moduleRoot, request);
    if (result === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Can't resolve ${request} against ${moduleRoot}`
      });
      return z.NEVER;
    }
    return {
      type: 'absolute-file',
      file: result
    };
  });
}

/**
 * Zod type that resolves node module request for folder into absolute folder,
 * given a list of expected index files in that folder
 * */
export function ResolvedModuleFolder(
  moduleRoot: string,
  ...indexFilesToLookFor: [string, ...string[]]
) {
  return z.string().transform<ContentAbsoluteFolder>((request, ctx) => {
    const requestWithSlash = request.endsWith('/') ? request : `${request}/`;

    for (const idxFile of indexFilesToLookFor) {
      const result = tryResolve(moduleRoot, requestWithSlash + idxFile);
      if (result !== undefined) {
        if (!result.endsWith(idxFile))
          throw new Error(`Unexpected resolve result ${result} with index file ${idxFile}`);
        return {
          type: 'absolute-folder',
          folder: result.slice(0, result.length - idxFile.length)
        };
      }
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Can't resolve ${request} folder against ${moduleRoot}, no index file found (${indexFilesToLookFor.join(', ')})`
    });
    return z.NEVER;
  });
}

export function mapLocalToAbsolute(
  root: string
): <T extends ContentAnyLocal>(value: T) => Exclude<T, ContentRelative> | ContentAbsoluteFile {
  return <T extends ContentAnyLocal>(value: T) =>
    value.type === 'relative'
      ? { type: 'absolute-file', file: path.resolve(root, value.path) }
      : (value as Exclude<T, ContentRelative>);
}

export function absoluteToString(): (value: ContentAbsoluteTextLocal) => Promise<string> {
  return async (value) => {
    if (value.type === 'absolute-file')
      return await fsp.readFile(value.file, { encoding: 'utf-8' });
    else return value.content;
  };
}

// TODO add type and size limitations
export function absoluteToBase64(): (
  value: ContentAbsoluteBinaryLocal
) => Promise<ContentExplicitBase64> {
  return async (value) => {
    if (value.type === 'absolute-file') {
      const mimeType = mime.lookup(value.file);
      if (!mimeType) throw new Error(`Can't recognize mime type of the file: ${value.file}.`);
      return {
        type: 'explicit-base64',
        mimeType,
        content: await fsp.readFile(value.file, { encoding: 'base64' })
      };
    } else return value;
  };
}

export function absoluteToBytes(): (
  value: ContentAbsoluteBinaryLocal
) => Promise<ContentExplicitBytes> {
  return async (value) => {
    if (value.type === 'absolute-file') {
      const mimeType = mime.lookup(value.file);
      if (!mimeType) throw new Error(`Can't recognize mime type of the file: ${value.file}.`);
      return {
        type: 'explicit-bytes',
        mimeType,
        content: Buffer.from(await fsp.readFile(value.file))
      };
    } else if (value.type === 'explicit-base64') {
      return {
        type: 'explicit-bytes',
        mimeType: value.mimeType,
        content: Buffer.from(value.content, 'base64')
      };
    } else return value;
  };
}

export function cpAbsoluteToRelative(
  dstFolder: string,
  fileAccumulator?: string[]
): <T extends Exclude<ContentAnyLocal, ContentRelative>>(
  value: T
) => Promise<Exclude<T, ContentAbsoluteFile> | ContentRelative> {
  return async <T extends Exclude<ContentAnyLocal, ContentRelative>>(value: T) => {
    if (value.type === 'absolute-file') {
      const fileName = path.basename(value.file);
      const dst = path.resolve(dstFolder, fileName);
      fileAccumulator?.push(fileName);
      await fsp.cp(value.file, dst);
      return { type: 'relative', path: fileName };
    } else return value as Exclude<T, ContentAbsoluteFile>;
  };
}

export function packFolderToRelativeTgz(
  dstFolder: string,
  tgzName: string,
  fileAccumulator?: string[]
): (value: ContentAbsoluteFolder) => Promise<ContentRelative> {
  if (!tgzName.endsWith('.tgz')) throw new Error(`Unexpected tgz file name: ${tgzName}`);
  return async (value: ContentAbsoluteFolder) => {
    const dst = path.resolve(dstFolder, tgzName);
    await tar.create(
      {
        gzip: true,
        file: dst,
        cwd: value.folder
      },
      ['.']
    );
    fileAccumulator?.push(tgzName);
    return { type: 'relative', path: tgzName };
  };
}

export type RelativeContentReader = (relativePath: string) => Promise<Buffer>;

export function relativeToExplicitString(
  reader: RelativeContentReader
): (value: ContentRelativeText) => Promise<ContentExplicitString> {
  return async (value) =>
    value.type === 'explicit-string'
      ? value
      : { type: 'explicit-string', content: (await reader(value.path)).toString('utf8') };
}

export function relativeToContentString(
  reader: RelativeContentReader
): (value: ContentRelativeText) => Promise<string> {
  return async (value) =>
    value.type === 'explicit-string' ? value.content : (await reader(value.path)).toString('utf8');
}

export function relativeToExplicitBinary64(
  reader: RelativeContentReader
): (value: ContentRelativeBinary) => Promise<ContentExplicitBase64> {
  return async (value) => {
    if (value.type === 'explicit-base64') return value;
    const mimeType = mime.lookup(value.path);
    if (!mimeType) throw new Error(`Can't recognize mime type of the file: ${value.path}.`);
    return {
      type: 'explicit-base64',
      mimeType,
      content: (await reader(value.path)).toString('base64')
    };
  };
}

export function relativeToExplicitBytes(
  reader: RelativeContentReader
): (value: ContentRelativeBinary) => Promise<ContentExplicitBytes> {
  return async (value) => {
    if (value.type === 'explicit-base64')
      return {
        type: 'explicit-bytes',
        mimeType: value.mimeType,
        content: Buffer.from(value.content, 'base64')
      };
    const mimeType = mime.lookup(value.path);
    if (!mimeType) throw new Error(`Can't recognize mime type of the file: ${value.path}.`);
    return {
      type: 'explicit-bytes',
      mimeType,
      content: await reader(value.path)
    };
  };
}
