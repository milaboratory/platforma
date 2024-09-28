import { test, expect } from '@jest/globals';
import { BlockPackRegistry } from './registry';
import path from 'node:path';
import { CentralBlockRegistry } from './well_known_registries';
import { V2RegistryProvider } from './registry-v2-provider';
import { Agent } from 'undici';

test.skip('testing remote registry', async () => {
  const registry = new BlockPackRegistry(new V2RegistryProvider(new Agent()), [
    { id: 'central', spec: CentralBlockRegistry }
  ]);
  const listing = await registry.listBlockPacks();
  expect(listing.blockPacks.length).toBeGreaterThanOrEqual(2);
});
