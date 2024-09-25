import {
  isNullResourceId,
  poll,
  TestHelpers,
  toGlobalResourceId
} from '@milaboratories/pl-client';
import { BlockPackPreparer, createBlockPack } from './block_pack';
import type { BlockPackSpecAny } from '../../model';
import path from 'node:path';
import { HmacSha256Signer } from '@milaboratories/ts-helpers';

const preparation = new BlockPackPreparer(new HmacSha256Signer(HmacSha256Signer.generateSecret()));

test.each([
  {
    spec: {
      type: 'from-registry-v1',
      registryUrl: 'https://block.registry.platforma.bio/releases',
      organization: 'milaboratory',
      package: 'enter-numbers',
      version: '0.4.1'
    } as BlockPackSpecAny
  },
  {
    spec: {
      type: 'dev',
      folder: path.resolve('integration', 'block-beta-sum-numbers')
    } as BlockPackSpecAny
  }
])('test load template from $spec.type', async ({ spec }) => {
  const config = await preparation.getBlockConfig(spec);
  expect(config).toBeDefined();
  expect(config.renderingMode).toEqual('Heavy');

  const specPrepared = await preparation.prepare(spec);

  await TestHelpers.withTempRoot(async (pl) => {
    const f0 = { resourceId: pl.clientRoot, fieldName: 'test0' };

    const bp = await pl.withWriteTx('test', async (tx) => {
      tx.createField(f0, 'Dynamic');
      const bp = createBlockPack(tx, specPrepared);
      tx.setField(f0, bp);
      await tx.commit();
      return await toGlobalResourceId(bp);
    });

    await poll(pl, async (a) => {
      const r = await a.get(bp).then((r) => r.final()); // this will await final state
      expect(isNullResourceId(r.data.error)).toBe(true);
    });
  });
});
