import { blockTest } from './test-block';

blockTest('test', { timeout: 60000 }, async ({ expect, rawPrj, helpers }) => {
  const testBlockId = await rawPrj.addBlock('Test Block', {
    type: 'from-registry-v1',
    registryUrl: 'https://block.registry.platforma.bio/releases',
    id: {
      organization: 'milaboratory',
      name: 'enter-numbers',
      version: '1.1.1',
    },
  });

  await rawPrj.setBlockArgs(testBlockId, { numbers: [1, 2, 3] });
  await rawPrj.runBlock(testBlockId);
  const stateSnapshot = await helpers.awaitBlockDoneAndGetStableBlockState(testBlockId);
  expect((stateSnapshot.outputs!['dependsOnBlocks1'] as any).value.length).toBeGreaterThan(5);
});
