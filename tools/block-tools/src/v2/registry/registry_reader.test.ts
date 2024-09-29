import { expect, test } from '@jest/globals';
import { RegistryV2Reader } from './registry_reader';
import { folderReaderByUrl } from '../../io';

test('test listing packets from global registry', async () => {
  const registryReader = new RegistryV2Reader(folderReaderByUrl('https://blocks.pl-open.science'));
  const listing = await registryReader.listBlockPacks();
  expect(listing.length).toBeGreaterThanOrEqual(1);
});

test('test getting components from global registry', async () => {
  const registryReader = new RegistryV2Reader(folderReaderByUrl('https://blocks.pl-open.science'));
  const components = await registryReader.getComponents({
    organization: 'milaboratories',
    name: 'samples-and-data',
    version: '1.3.0'
  });
  console.dir(components, { depth: 5 });
});
