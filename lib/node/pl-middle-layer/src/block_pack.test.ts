import {
  isNotNullResourceId,
  isNullResourceId,
  sleep,
  TestHelpers,
  toGlobalResourceId
} from '@milaboratory/pl-ts-client-v2';
import { BlockPackCustom, createBlockPack } from './block_pack';
import { ExplicitTemplateSumNumbers } from './explicit_templates';

test('test load custom template from registry', async () => {
  const spec: BlockPackCustom = {
    type: 'custom',
    template: {
      type: 'from-registry',
      registry: 'milaboratories',
      path: 'dev/v1/milaboratory/sum-numbers/0.0.1-1-main/template.plj.gz'
    }
  };

  await TestHelpers.withTempRoot(async pl => {
    const f0 = { resourceId: pl.clientRoot, fieldName: 'test0' };

    const bp = await pl.withWriteTx('test', async tx => {
      tx.createField(f0, 'Dynamic');
      const bp = createBlockPack(tx, spec);
      tx.setField(f0, bp);
      await tx.commit();
      return await toGlobalResourceId(bp);
    });

    while (true) {
      if (await pl.withReadTx('test', async tx => {
        const fieldData = await tx.getResourceData(bp, true);
        expect(isNullResourceId(fieldData.error)).toBe(true);
        return fieldData.fields[0].status === 'Resolved';
      }))
        break;
      await sleep(30);
    }
  });
});

test('test load custom template from explicit', async () => {
  const spec: BlockPackCustom = {
    type: 'custom',
    template: {
      type: 'explicit',
      content: ExplicitTemplateSumNumbers
    }
  };

  await TestHelpers.withTempRoot(async pl => {
    const f0 = { resourceId: pl.clientRoot, fieldName: 'test0' };

    const bp = await pl.withWriteTx('test', async tx => {
      tx.createField(f0, 'Dynamic');
      const bp = createBlockPack(tx, spec);
      tx.setField(f0, bp);
      await tx.commit();
      return await toGlobalResourceId(bp);
    });

    while (true) {
      if (await pl.withReadTx('test', async tx => {
        const fieldData = await tx.getResourceData(bp, true);
        expect(isNullResourceId(fieldData.error)).toBe(true);
        return fieldData.fields[0].status === 'Resolved';
      }))
        break;
      await sleep(30);
    }
  });
});
