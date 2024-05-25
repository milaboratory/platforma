import {
  ensureResourceIdNotNull,
  field,
  isNotNullResourceId,
  isNullResourceId,
  TestHelpers,
  toGlobalResourceId
} from '@milaboratory/pl-client-v2';
import { createProject, loadProject } from './project';
import { ExplicitTemplateEnterNumbers, ExplicitTemplateSumNumbers } from './block-pack/explicit_templates';
import { TemplateSourcePrepared } from '../model/template';
import { outputRef } from '../model/args';
import { sleep } from '@milaboratory/ts-helpers';
import { projectFieldName } from '../model/project_model';

const specEnterExplicit: TemplateSourcePrepared = {
  type: 'explicit',
  content: ExplicitTemplateEnterNumbers
};

const specEnterFromRegistry: TemplateSourcePrepared = {
  type: 'from-registry',
  registry: 'milaboratories',
  path: 'releases/v1/milaboratory/enter-numbers/0.0.2/template.plj.gz'
};

const specSumExplicit: TemplateSourcePrepared = {
  type: 'explicit',
  content: ExplicitTemplateSumNumbers
};

const specSumFromRegistry: TemplateSourcePrepared = {
  type: 'from-registry',
  registry: 'milaboratories',
  path: 'releases/v1/milaboratory/sum-numbers/0.0.2/template.plj.gz'
};

test('simple test #1', async () => {
  await TestHelpers.withTempRoot(async pl => {
    const prj = await pl.withWriteTx('CreatingProject', async tx => {
      const prjRef = createProject(tx);
      tx.createField(field(tx.clientRoot, 'prj'), 'Dynamic', prjRef);
      await tx.commit();
      return await toGlobalResourceId(prjRef);
    });

    await pl.withWriteTx('AddBlock1', async tx => {
      const mut = await loadProject(tx, prj);
      const struct = mut.structure;
      struct.groups[0].blocks.push({ id: 'block1', name: 'Block1', renderingMode: 'Heavy' });
      mut.updateStructure(struct, (blockId) => {
        expect(blockId).toEqual('block1');
        return {
          inputs: JSON.stringify({ numbers: [1, 2, 3] }),
          blockPack: {
            type: 'custom',
            template: specEnterFromRegistry
          }
        };
      });
      mut.doRefresh(1);
      mut.save();
      await tx.commit();
    });

    await pl.withWriteTx('AddBlock2', async tx => {
      const mut = await loadProject(tx, prj);
      const struct = mut.structure;
      struct.groups[0].blocks.push({ id: 'block2', name: 'Block2', renderingMode: 'Heavy' });
      mut.updateStructure(struct, (blockId) => {
        expect(blockId).toEqual('block2');
        return {
          inputs: JSON.stringify({ numbers: [3, 4, 5] }),
          blockPack: {
            type: 'custom',
            template: specEnterFromRegistry
          }
        };
      });
      mut.renderProduction(['block1', 'block2']);
      mut.doRefresh(1);
      mut.save();
      await tx.commit();
    });

    await pl.withWriteTx('AddBlock3', async tx => {
      const mut = await loadProject(tx, prj);
      const struct = mut.structure;
      struct.groups[0].blocks.push({ id: 'block3', name: 'Block3', renderingMode: 'Heavy' });
      mut.updateStructure(struct, (blockId) => {
        expect(blockId).toEqual('block3');
        return {
          inputs: JSON.stringify({
            sources: [
              outputRef('block1', 'column'),
              outputRef('block2', 'column')
            ]
          }),
          blockPack: {
            type: 'custom',
            template: specSumFromRegistry
          }
        };
      });
      mut.renderProduction(['block1', 'block2', 'block3']);
      mut.doRefresh(1);
      mut.save();
      await tx.commit();
    });

    let cont = true;
    while (cont) {
      cont = await pl.withReadTx('ReadingResult', async tx => {
        const allFields = await tx.getResourceData(prj, true);
        const all1 = await Promise.all(allFields.fields.map(f => isNotNullResourceId(f.value) ? tx.getResourceData(f.value, true) : undefined));
        const all2 = await Promise.all(all1
          .flatMap(ff => ff?.fields ?? [])
          .map(f => isNotNullResourceId(f.value) ? tx.getResourceData(f.value, true) : undefined));
        const prodCtx = await tx.getResourceData(ensureResourceIdNotNull(allFields.fields.find(f => f.name === 'block3-prodCtx')!.value), true);
        const f = await tx.getField(field(prj, projectFieldName({ blockId: 'block3', fieldName: 'prodOutput' })));
        if (isNotNullResourceId(f.error)) {
          const error = await tx.getResourceData(f.error, false);
          throw new Error(Buffer.from(error.data!).toString());
        }
        if (isNullResourceId(f.value))
          return true;
        const output = await tx.getResourceData(f.value, true);
        if (output.resourceReady || isNotNullResourceId(output.error))
          return false;
        return true;
      });
      await sleep(30);
    }
  });
});
