import path from 'path';
import { describe, test, expect } from 'vitest';
import { isFolderURL, getPathForFolderURL } from './url';
import type { Signer } from '@milaboratories/ts-helpers';
import { HmacSha256Signer } from '@milaboratories/ts-helpers';
import { FolderURL } from '@milaboratories/pl-model-common';

describe('isFolderURL', () => {
  test('should return true for a valid URL', () => {
    const folderUrl = 'plblob+folder://5976f110166cc5d8803c41181fbb708470b69075db19ad98d8971df350732028.31330_tgz.blob/path/to/folder';
    expect(isFolderURL(folderUrl)).toBe(true);
  });

  test('should return false for URL with a different protocol', () => {
    expect(isFolderURL('https://example.com/path/to/folder')).toBe(false);
  });

  test('should throw error for incorrect URLs', () => {
    expect(() => {
      isFolderURL('not_a_valid_url');
    }).toThrow();
  });
});

describe('getPathForFolderURL', () => {
  const signer: Signer = {
    sign: (data: string | Uint8Array) => 'signature',

    verify: (data: string | Uint8Array, signature: string, validationErrorMessage?: string) => null,
  };

  test('should be ok', () => {
    const folderURL = 'plblob+folder://signature.subfolder_tgz.blob/path/to/resource.html';

    const result = getPathForFolderURL(signer, folderURL, '/test/dir');

    expect(result).toBe(path.join('/test/dir/subfolder_tgz/path/to/resource.html'));
  });
});
