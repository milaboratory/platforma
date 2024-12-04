import {
  BlockRegistryV2,
  RegistryV2Reader,
  folderReaderByUrl,
  storageByUrl
} from '@platforma-sdk/block-tools';
import {
  AnyChannel,
  BlockPackManifest,
  overrideManifestVersion,
  StableChannel
} from '@milaboratories/pl-model-middle-layer';
import fsp from 'fs/promises';
import { regTest } from './test_utils';
import path from 'path';
import { createRequire } from 'node:module';
import { test } from 'vitest';
import * as tp from 'timers/promises';

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
  const manifest2 = overrideManifestVersion(manifest1, version2);
  await registry.publishPackage(manifest2, async (file) =>
    Buffer.from(await fsp.readFile(path.resolve(manifestRoot, file)))
  );

  await registry.updateIfNeeded();

  await registry.addPackageToChannel(manifest2.description.id, StableChannel);

  await registry.updateIfNeeded();

  // Reading

  const registryReader = new RegistryV2Reader(folderReaderByUrl(registryUrl), {
    cacheBlockListFor: 1,
    keepStaleBlockListFor: 1
  });
  const overview1 = await registryReader.listBlockPacks();
  expect(overview1).length.greaterThanOrEqual(1);
  const ten1 = overview1.find((o) => o.id.name === 'test-enter-numbers');
  expect(ten1).toBeDefined();
  const dAny1 = ten1!.latestByChannel[AnyChannel]!;
  expect(dAny1.meta.logo?.mimeType).toStrictEqual('image/png');
  expect(dAny1.meta.organization.logo?.mimeType).toStrictEqual('image/png');
  const components = await registryReader.getComponents(dAny1.id);
  expect(await fsp.stat(new URL(components.workflow.main.url).pathname)).toBeDefined();
  expect(await fsp.stat(new URL(components.model.url).pathname)).toBeDefined();
  expect(await fsp.stat(new URL(components.ui.url).pathname)).toBeDefined();

  const vc11 = ten1!.allVersions.find((v) => v.version === version1);
  const vc12 = ten1!.allVersions.find((v) => v.version === version2);

  expect(vc11?.channels).toStrictEqual([]);
  expect(vc12?.channels).toStrictEqual([StableChannel]);

  const dStable1 = ten1!.latestByChannel[StableChannel]!;

  expect(dStable1.id.version).toStrictEqual(version2);

  // Deleta stable marker

  await registry.removePackageFromChannel(manifest2.description.id, StableChannel);
  await registry.updateIfNeeded();

  await tp.setTimeout(10);

  const overview2 = await registryReader.listBlockPacks();
  expect(overview2).length.greaterThanOrEqual(1);
  const ten2 = overview2.find((o) => o.id.name === 'test-enter-numbers');
  expect(ten2).toBeDefined();

  const vc21 = ten2!.allVersions.find((v) => v.version === version1);
  const vc22 = ten2!.allVersions.find((v) => v.version === version2);

  expect(vc21?.channels).toStrictEqual([]);
  expect(vc22?.channels).toStrictEqual([]);

  const dStable2 = ten2!.latestByChannel[StableChannel]!;

  expect(dStable2).toBeUndefined();
});
