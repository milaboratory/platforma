import {
  BlockRegistryV2,
  RegistryV2Reader,
  folderReaderByUrl,
  storageByUrl
} from '@platforma-sdk/block-tools';
import { BlockPackManifest } from '@milaboratories/pl-model-middle-layer';
import fsp from 'fs/promises';
import { regTest } from './test_utils';
import path from 'path';
import { createRequire } from 'node:module';
import { test } from 'vitest';
import * as R from 'remeda';

// To overcome broken native ESM resolution mechanism:
//     TypeError: __vite_ssr_import_meta__.resolve is not a function
// Solution suggested by vitest contributor:
//     https://github.com/vitejs/vite/discussions/15871#discussioncomment-8473464
const require = createRequire(import.meta.url);

function bumpVersion(ver: string): string {
  let sepIdx = ver.lastIndexOf('.');
  if (sepIdx === -1) throw new Error(`Malformed version: ${ver}`);
  sepIdx++; // to includes '.'
  return `${ver.substring(0, sepIdx)}${Number(ver.substring(sepIdx)) + 1}`;
}

test('test bump version', ({ expect }) => {
  expect(bumpVersion('1.2.3')).toEqual('1.2.4');
  expect(bumpVersion('1.2.10')).toEqual('1.2.11');
  expect(bumpVersion('1.1.9')).toEqual('1.1.10');
});

regTest('simple repo test', async ({ expect, tmpFolder }) => {
  const registryUrl = `file:${tmpFolder}`;

  // Publishing

  const manifestPath = require.resolve(
    '@milaboratories/milaboratories.test-enter-numbers/block-pack/manifest.json'
  );
  const manifest1 = BlockPackManifest.parse(
    JSON.parse(await fsp.readFile(manifestPath, { encoding: 'utf-8' }))
  );
  const manifestRoot = path.dirname(manifestPath);
  const storage = storageByUrl(registryUrl);
  const registry = new BlockRegistryV2(storage);
  const version1 = manifest1.description.id.version;
  await registry.publishPackage(manifest1, async (file) =>
    Buffer.from(await fsp.readFile(path.resolve(manifestRoot, file)))
  );

  // bumping version, and adding another one
  const version2 = bumpVersion(version1);
  // patching manifest
  const manifest2 = R.mergeDeep(manifest1, { description: { id: { version: version2 } } });
  await registry.publishPackage(manifest2, async (file) =>
    Buffer.from(await fsp.readFile(path.resolve(manifestRoot, file)))
  );

  await registry.updateIfNeeded();

  // Reading

  const registryReader = new RegistryV2Reader(folderReaderByUrl(registryUrl));
  const overview = await registryReader.listBlockPacks();
  expect(overview).length.greaterThanOrEqual(1);
  const ten = overview.find((o) => o.id.name === 'test-enter-numbers');
  expect(ten?.meta.logo?.mimeType).toStrictEqual('image/png');
  expect(ten?.meta.organization.logo?.mimeType).toStrictEqual('image/png');
  const components = await registryReader.getComponents(ten!.id);
  expect(await fsp.stat(new URL(components.workflow.main.url).pathname)).toBeDefined();
  expect(await fsp.stat(new URL(components.model.url).pathname)).toBeDefined();
  expect(await fsp.stat(new URL(components.ui.url).pathname)).toBeDefined();
});
