import { z } from 'zod';
import {
  ConstructContent,
  ContentAbsoluteFile,
  ContentAbsoluteFolder,
  ContentAbsoluteTextLocal,
  ContentAbsoluteUrl,
  ContentAny,
  ContentAnyBinaryLocal,
  ContentAnyBinaryRemote,
  ContentAnyLocal,
  ContentAnyTextLocal,
  ContentAnyTextRemote,
  ContentRelative
} from './content_types';
import { ContentType, ContextType } from './common';
import path from 'path';

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

function tryResolve(root: string, request: string): string | undefined {
  try {
    return require.resolve(request, {
      paths: [root]
    });
  } catch (err: any) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err;
  }
  return undefined;
}

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

export function mapRemoteToAbsoluteh(
  rootUrl: string
): <T extends ContentAnyLocal>(value: T) => Exclude<T, ContentRelative> | ContentAbsoluteUrl {
  const rootWithSlash = rootUrl.endsWith('/') ? rootUrl : `${rootUrl}/`;
  return <T extends ContentAnyLocal>(value: T) =>
    value.type === 'relative'
      ? { type: 'absolute-url', url: rootWithSlash + value.path }
      : (value as Exclude<T, ContentRelative>);
}

export function localizeFile(
  dstFolder: string,
  fileAccumulator?: string[]
): <T extends ContentAnyLocal>(
  value: T
) => Promise<Exclude<T, ContentAbsoluteFile> | ContentRelative> {
  return async <T extends ContentAnyLocal>(value: T) => {
    if (value.type === 'absolute-file') {
      const fileName = path.basename(value.file);
    }
  };

  // ? { type: 'absolute-file', file: path.resolve(root, value.path) }
  // : (value as Exclude<T, ContentRelative>);
}
