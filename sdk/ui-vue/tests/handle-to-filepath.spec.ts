import { getFilePathFromHandle } from '@milaboratory/sdk-ui';
import { expect, test } from 'vitest';

const handle =
  'upload://upload/%7B%22localPath%22%3A%22%2FUsers%2Fgramkin%2Ftest%2Ftest.txt%22%2C%22pathSignature%22%3A%2279f4bfe5838d576e654cb4d52aef9a1b9910b9e15c12eb405a8eab61fbd054ff%22%2C%22sizeBytes%22%3A%224%22%2C%22modificationTime%22%3A%221722514481%22%7D';

test('defineStore', async () => {
  const filePath = getFilePathFromHandle(handle);

  expect(filePath).toBe('/Users/gramkin/test/test.txt');
});
