import { field, isNotNullResourceId, TestHelpers, toGlobalResourceId } from '@milaboratory/pl-client-v2';
import { createProject, loadProject } from './project';
import { ExplicitTemplateEnterNumbers, ExplicitTemplateSumNumbers } from './explicit_templates';
import { TemplateSourcePrepared } from './model/template';

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

test('simple test', async () => {
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
      mut.save();
      await tx.commit();
    });
  });
});
