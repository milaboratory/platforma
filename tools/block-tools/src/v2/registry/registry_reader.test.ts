import { expect, test } from '@jest/globals';
import { RegistryV2Reader } from './registry_reader';
import { folderReaderByUrl } from '../../io';
import { request } from 'undici';
import { AnyChannel } from '@milaboratories/pl-model-middle-layer';

test('test listing packets from global registry', async () => {
  const registryReader = new RegistryV2Reader(folderReaderByUrl('https://blocks.pl-open.science'));
  const listing = await registryReader.listBlockPacks();
  expect(listing.length).toBeGreaterThanOrEqual(1);
  // console.dir(listing, { depth: 5 });
  expect(listing[0].allVersions.length).toBeGreaterThanOrEqual(1);
  expect(listing[0].latestByChannel[AnyChannel]).toBeDefined();
}, 20000);

test('test getting components from global registry', async () => {
  const registryReader = new RegistryV2Reader(folderReaderByUrl('https://blocks.pl-open.science'));
  const components = await registryReader.getComponents({
    organization: 'milaboratories',
    name: 'samples-and-data',
    version: '1.3.0'
  });
  // console.dir(components, { depth: 5 });
  expect((await (await request(components.ui.url)).body.arrayBuffer()).byteLength).toBeGreaterThan(
    100
  );
  expect(
    (await (await request(components.model.url)).body.arrayBuffer()).byteLength
  ).toBeGreaterThan(100);
  expect(
    (await (await request(components.workflow.main.url)).body.arrayBuffer()).byteLength
  ).toBeGreaterThan(100);
}, 20000);
