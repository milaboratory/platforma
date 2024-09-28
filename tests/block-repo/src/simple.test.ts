import { test } from 'vitest';
import { RegistryV2Reader, folderReaderByUrl } from '@platforma-sdk/block-tools';
import path from 'path';

test('simple repo test', async ({ expect }) => {
  const url = `file:./the-reg`;
  const reg = new RegistryV2Reader(url, folderReaderByUrl(url));
  const overview = await reg.listBlockPacks();
  expect(overview).length.greaterThanOrEqual(1);
  const ten = overview.find((o) => o.id.name === 'test-enter-numbers');
  expect(ten?.meta.logo?.mimeType).toStrictEqual('image/png');
  expect(ten?.meta.organization.logo?.mimeType).toStrictEqual('image/png');
});
