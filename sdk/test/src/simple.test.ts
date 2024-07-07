import { blockTest } from './block-test';

blockTest('test', { timeout: 60000 }, async ({ expect, rawPrj, helpers }) => {
  const testBlockId = await rawPrj.addBlock('Test Block', {
    type: 'from-registry-v1',
    registryUrl: 'https://block.registry.platforma.bio/releases',
    organization: 'milaboratory',
    package: 'enter-numbers',
    version: '1.1.1'
  });

  await rawPrj.setBlockArgs(testBlockId, { numbers: [1, 2, 3] });
  await rawPrj.runBlock(testBlockId);
  await helpers.awaitBlockDone(testBlockId);
  const blockState = rawPrj.getBlockState(testBlockId);
  await blockState.awaitStableValue();
  const stateSnapshot = await blockState.getValue();
  expect(
    (stateSnapshot.outputs!['dependsOnBlocks1'] as any).value.length
  ).toBeGreaterThan(5);
});
