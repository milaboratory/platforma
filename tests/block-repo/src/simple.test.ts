import { test } from 'vitest';
import { RegistryV2Reader, folderReaderByUrl } from '@platforma-sdk/block-tools';
import { stat } from 'fs/promises';

test('simple repo test', async ({ expect }) => {
  const reg = new RegistryV2Reader(folderReaderByUrl(`file:./the-reg`));
  const overview = await reg.listBlockPacks();
  expect(overview).length.greaterThanOrEqual(1);
  const ten = overview.find((o) => o.id.name === 'test-enter-numbers');
  expect(ten?.meta.logo?.mimeType).toStrictEqual('image/png');
  expect(ten?.meta.organization.logo?.mimeType).toStrictEqual('image/png');
  // console.dir(ten, { depth: 5 });
  const components = await reg.getComponents(ten!.id);
  expect(await stat(new URL(components.workflow.main.url).pathname)).toBeDefined();
  expect(await stat(new URL(components.model.url).pathname)).toBeDefined();
  expect(await stat(new URL(components.ui.url).pathname)).toBeDefined();
});

