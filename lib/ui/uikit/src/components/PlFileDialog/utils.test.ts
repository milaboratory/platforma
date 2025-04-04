import { describe, expect, test } from 'vitest';
import { getFilePathBreadcrumbs } from './utils';

describe('getFilePathBreadcrumbs', () => {
  test.each([
    {
      name: 'root path "/"',
      path: '/',
      expected: [
        { index: 0, name: 'Root', path: '' },
      ],
    },
    {
      name: 'empty path ""',
      path: '',
      expected: [
        { index: 0, name: 'Root', path: '' },
      ],
    },
    {
      name: 'single-level path "/folder"',
      path: '/folder',
      expected: [
        { index: 0, name: 'Root', path: '' },
        { index: 1, name: 'folder', path: '/folder' },
      ],
    },
    {
      name: 'multi-level path "/folder/subfolder/file.txt"',
      path: '/folder/subfolder/file.txt',
      expected: [
        { index: 0, name: 'Root', path: '' },
        { index: 1, name: 'folder', path: '/folder' },
        { index: 2, name: 'subfolder', path: '/folder/subfolder' },
        { index: 3, name: 'file.txt', path: '/folder/subfolder/file.txt' },
      ],
    },
    {
      name: 'path without leading slash "folder/file.txt"',
      path: 'folder/file.txt',
      expected: [
        { index: 0, name: 'Root', path: '' },
        { index: 1, name: 'folder', path: 'folder' },
        { index: 2, name: 'file.txt', path: 'folder/file.txt' },
      ],
    },
  ])('should handle $name', ({ path, expected }) => {
    const result = getFilePathBreadcrumbs(path);
    expect(result).toEqual(expected);
  });
});
