import { test, expect } from 'vitest';
import { BlockPackRegistry } from './registry';
import { CentralBlockRegistry } from './well_known_registries';
import { V2RegistryProvider } from './registry-v2-provider';
import { BlockPackFromRegistryV2 } from '@milaboratories/pl-model-middle-layer';
import { defaultHttpDispatcher } from '@milaboratories/pl-http';

test('testing remote registry', async () => {
  const registry = new BlockPackRegistry(new V2RegistryProvider(defaultHttpDispatcher()), [
    { id: 'central', title: 'Central Block Registry', spec: CentralBlockRegistry }
  ]);
  const listing = await registry.listBlockPacks();
  expect(listing.blockPacks.length).toBeGreaterThanOrEqual(1);
});

test('testing specific version retrieval', async () => {
  const registry = new BlockPackRegistry(new V2RegistryProvider(defaultHttpDispatcher()), [
    { id: 'central', title: 'Central Block Registry', spec: CentralBlockRegistry }
  ]);
  const overview = await registry.getOverview(
    'central',
    {
      name: 'samples-and-data',
      organization: 'milaboratories',
      version: '1.8.5'
    },
    'stable'
  );
  expect((overview.spec as BlockPackFromRegistryV2).id.version).toStrictEqual('1.8.5');
  expect((overview.spec as BlockPackFromRegistryV2).channel).toStrictEqual('stable');
});
