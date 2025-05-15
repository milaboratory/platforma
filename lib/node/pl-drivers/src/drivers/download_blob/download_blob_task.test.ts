import { describe, it, expect } from 'vitest';
import { getDownloadedBlobResponse } from './download_blob_task';
import type {
  LocalBlobHandle,
  LocalBlobHandleAndSize,
} from '@milaboratories/pl-model-common';
import type { ValueOrError, Signer } from '@milaboratories/ts-helpers';
import { CallersCounter } from '@milaboratories/ts-helpers';
import type { CachedFileRange } from '../helpers/range_blobs_cache';
import type { RangeBytes } from '@milaboratories/pl-model-common';
import { newLocalHandle } from '../helpers/download_local_handle';
import { genRangeFile, genWholeFile } from '../helpers/test_helpers';

// Dummy signer for creating test handles
const genLocalHandle = (path: string) => {
  const dummySigner: Signer = {
    sign: (data: string) => 'dummySignature',
    verify: (data: string, signature: string, errorMessage?: string) => {
    },
  };

  return newLocalHandle(path, dummySigner);
};

describe('getDownloadedBlobResponse', () => {
  it('should error when error is provided', () => {
    const error = new Error('Download failed');
    const result = getDownloadedBlobResponse(undefined, error);
    expect(result).toEqual({ ok: false, error });
  });

  it('should ok when whole file and no needed range', () => {
    const cachedFile = genWholeFile('test/path', 'base', 1000);

    const result = getDownloadedBlobResponse({ cached: cachedFile, handle: genLocalHandle('/test/path') });

    expect(result).toEqual({
        ok: true,
        value: {
          handle: genLocalHandle('/test/path'),
          size: 1000,
          startByte: 0,
          endByte: 1000,
        },
      });
  });

  it('should ok when whole file and needed range', () => {
    const cachedFile = genWholeFile('test/path', 'base', 1000);

    const result = getDownloadedBlobResponse(
        { cached: cachedFile, handle: genLocalHandle('/test/path') },
        undefined,
        { from: 100, to: 200 },
    );

    expect(result).toEqual({
        ok: true,
        value: {
          handle: genLocalHandle('/test/path'),
          size: 100,
          startByte: 100,
          endByte: 200,
        },
      });
  });

  it('should ok when range file and no needed range', () => {
    const cachedFile = genRangeFile('test/path', 'base', { from: 100, to: 600 });

    const result = getDownloadedBlobResponse(
        { cached: cachedFile, handle: genLocalHandle('/test/path') },
        undefined,
    );

    expect(result).toEqual({
      ok: true,
      value: {
        handle: genLocalHandle('/test/path'),
        size: 500,
        startByte: 0, // Refers to the start of the cached file
        endByte: 500, // Refers to the end (exclusive) of the cached file
      },
    });
  });

  it('should ok when range file and needed range', () => {
    const cachedFile = genRangeFile('test/path', 'base', { from: 100, to: 600 });

    const result = getDownloadedBlobResponse(
        { cached: cachedFile, handle: genLocalHandle('/test/path') },
        undefined,
        { from: 150, to: 250 },
    );

    expect(result).toEqual({
      ok: true,
      value: {
        handle: genLocalHandle('/test/path'),
        size: 100,
        startByte: 50,
        endByte: 150,
      },
    });
  });

  it('should ok when range file and the same needed range', () => {
    const cachedFile = genRangeFile('test/path', 'base', { from: 100, to: 600 });

    const result = getDownloadedBlobResponse(
        { cached: cachedFile, handle: genLocalHandle('/test/path') },
        undefined,
        { from: 100, to: 600 },
    );

    expect(result).toEqual({
      ok: true,
      value: {
        handle: genLocalHandle('/test/path'),
        size: 500,
        startByte: 0,
        endByte: 500,
      },
    });
  });
}); 