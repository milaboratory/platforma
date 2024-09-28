import { expect, test } from '@jest/globals';
import { folderReaderByUrl } from './folder_reader';

test('test fs reader', async () => {
  const reader = folderReaderByUrl('file:.');
  const content = await reader.getContentReader()('package.json');
  expect(content).toBeDefined();
  expect(content.length).toBeGreaterThan(10);
});

test('test url reader with slash', async () => {
  const reader = folderReaderByUrl('https://cdn.milaboratory.com/');
  const content = await reader.getContentReader()('ping');
  expect(content?.toString('utf8')).toStrictEqual('pong');
});

test('test url reader without slash', async () => {
  const reader = folderReaderByUrl('https://cdn.milaboratory.com');
  const content = await reader.getContentReader()('ping');
  expect(content?.toString('utf8')).toStrictEqual('pong');
});
