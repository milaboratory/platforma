import {
  isNullResourceId, poll,
  TestHelpers,
  toGlobalResourceId
} from '@milaboratory/pl-client-v2';
import { BlockPackPreparer, createBlockPack } from './block_pack';
import { BlockPackSpecAny } from '../../model/block_pack_spec';
import path from 'node:path';

const preparation = new BlockPackPreparer('secret');

test.each([
  {
    spec: {
      type: 'from-registry-v1',
      url: 'https://block.registry.platforma.bio/releases/v1/milaboratory/enter-numbers/0.2.0'
    } as BlockPackSpecAny
  },
  {
    spec: {
      type: 'dev',
      folder: path.resolve('integration', 'dev-project-test')
    } as BlockPackSpecAny
  }
])('test load template from $spec.type', async ({ spec }) => {
  const specPrepared = await preparation.prepare(spec);

  await TestHelpers.withTempRoot(async pl => {
    const f0 = { resourceId: pl.clientRoot, fieldName: 'test0' };

    const bp = await pl.withWriteTx('test', async tx => {
      tx.createField(f0, 'Dynamic');
      const bp = createBlockPack(tx, specPrepared);
      tx.setField(f0, bp);
      await tx.commit();
      return await toGlobalResourceId(bp);
    });

    await poll(pl, async a => {
      const r = await a.get(bp)
        .then(r => r.final()); // this will await final state
      expect(isNullResourceId(r.data.error)).toBe(true);
    });
  });
});
