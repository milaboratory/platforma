import { fullNameFromFileName } from './main';
import { expect, describe, test } from 'vitest';

describe.concurrent('fullNameFromFileName', () => {
  const defaultPackageId = {
    name: 'test-package',
    version: '1.0.0'
  };

  test.each([
    {
      filename: 'myLib.lib.tengo',
      expectedType: 'library',
      expectedId: 'myLib'
    },
    {
      filename: 'myTemplate.tpl.tengo',
      expectedType: 'template',
      expectedId: 'myTemplate'
    },
    {
      filename: 'mySoftware.sw.json',
      expectedType: 'software',
      expectedId: 'mySoftware'
    },
    {
      filename: 'myAsset.as.json',
      expectedType: 'asset',
      expectedId: 'myAsset'
    },
    {
      filename: 'myTest.test.tengo',
      expectedType: 'test',
      expectedId: 'myTest'
    }
  ])('should correctly parse %s as %s with id %s', ({ filename, expectedType, expectedId }) => {
    const result = fullNameFromFileName(defaultPackageId, filename);
    expect(result).toEqual({
      pkg: defaultPackageId.name,
      version: defaultPackageId.version,
      id: expectedId,
      type: expectedType
    });
  });
});
