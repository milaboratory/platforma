import { field, poll, TestHelpers, toGlobalResourceId } from '@milaboratories/pl-client';
import { createProject, ProjectMutator, withProject } from './project';
import { outputRef } from '../model/args';
import {
  BlockRenderingStateKey,
  projectFieldName,
  ProjectRenderingState
} from '../model/project_model';
import {
  BPSpecEnterV041NotPrepared,
  BPSpecSumV042NotPrepared,
  TestBPPreparer
} from '../test/block_packs';
import { getQuickJS } from 'quickjs-emscripten';
import { ProjectHelper } from '../model/project_helper';
import { cachedDeserialize } from '@milaboratories/ts-helpers';

test('simple test #1', async () => {
  const quickJs = await getQuickJS();

  await TestHelpers.withTempRoot(async (pl) => {
    const prj = await pl.withWriteTx('CreatingProject', async (tx) => {
      const prjRef = await createProject(tx);
      tx.createField(field(tx.clientRoot, 'prj'), 'Dynamic', prjRef);
      await tx.commit();
      return await toGlobalResourceId(prjRef);
    });  

    await pl.withWriteTx('AddBlock1', async (tx) => {
      const mut = await ProjectMutator.load(new ProjectHelper(quickJs), tx, prj);
      mut.addBlock(
        { id: 'block1', label: 'Block1', renderingMode: 'Heavy' },
        {
          args: JSON.stringify({ numbers: [1, 2, 3] }),
          uiState: "{}",
          blockPack: await TestBPPreparer.prepare(BPSpecEnterV041NotPrepared)
        }
      );
      mut.save();
      await tx.commit();
    });

    await pl.withWriteTx('AddBlock2', async (tx) => {
      const mut = await ProjectMutator.load(new ProjectHelper(quickJs), tx, prj);
      mut.addBlock(
        { id: 'block2', label: 'Block2', renderingMode: 'Heavy' },
        {
          args: JSON.stringify({ numbers: [3, 4, 5] }),
          uiState: "{}",
          blockPack: await TestBPPreparer.prepare(BPSpecEnterV041NotPrepared)
        }
      );
      mut.renderProduction(['block1', 'block2']);
      mut.save();
      await tx.commit();
    });

    await pl.withWriteTx('AddBlock3', async (tx) => {
      const mut = await ProjectMutator.load(new ProjectHelper(quickJs), tx, prj);
      mut.addBlock(
        { id: 'block3', label: 'Block3', renderingMode: 'Heavy' },
        {
          args: JSON.stringify({
            sources: [outputRef('block1', 'column'), outputRef('block2', 'column')]
          }),
          uiState: "{}",
          blockPack: await TestBPPreparer.prepare(BPSpecSumV042NotPrepared)
        }
      );
      const rendered = mut.renderProduction(['block3'], true);
      expect([...rendered]).toEqual(['block3']);
      mut.setStates([
        { blockId: 'block2', uiState: {"some":1} },
        { blockId: 'block3', uiState: {"some":2} }
      ]);
      mut.doRefresh();
      mut.save();
      await tx.commit();
    });

    await poll(pl, async (tx) => {
      const prjR = await tx.get(prj);
      const outputs = await prjR
        .get(projectFieldName('block3', 'prodOutput'))
        .then((r) => r.final());
      const all = await outputs.getAllFinal();
      expect(new Set(Object.keys(all))).toEqual(new Set(['sum', 'dependsOnBlocks']));
      const v = await outputs.get('sum');
      console.log(Buffer.from(v.data.data!).toString());
    });

    await poll(pl, async (tx) => {
      const prjR = await tx.get(prj);
      const outputs = await prjR
        .get(projectFieldName('block3', 'stagingOutput'))
        .then((r) => r.final());
      const all = await outputs.getAllFinal();
      expect(new Set(Object.keys(all))).toEqual(new Set(['opts', 'dependsOnBlocks']));
    });

    await poll(pl, async (tx) => {
      const prjR = await tx.get(prj);
      const uiStateB2 = await prjR
        .get(projectFieldName('block2', 'uiState'));
      expect(Buffer.from(uiStateB2.data.data!).toString()).toEqual('{"some":1}');

      const uiStateB3 = await prjR
        .get(projectFieldName('block3', 'uiState'));
      expect(Buffer.from(uiStateB3.data.data!).toString()).toEqual('{"some":2}');
    });

    await pl.withWriteTx('DeleteBlock2', async (tx) => {
      const mut = await ProjectMutator.load(new ProjectHelper(quickJs), tx, prj);
      mut.deleteBlock('block2');
      mut.save();
      await tx.commit();
    });

    await poll(pl, async (tx) => {
      const prjR = await tx.get(prj);
      const uiState = prjR.data.fields.find((f) => f.name === projectFieldName('block2', 'uiState'));
      expect(uiState).toBeUndefined();
    });

    await poll(pl, async (tx) => {
      const prjR = await tx.get(prj);
      expect(prjR.data.fields.map((f) => f.name)).not.toContain(
        projectFieldName('block3', 'stagingOutput')
      );
      const renderingState = await prjR.getKValueObj<ProjectRenderingState>(BlockRenderingStateKey);
      expect(renderingState.blocksInLimbo).toContain('block3');
    });

    await pl.withWriteTx('Refresh', async (tx) => {
      const mut = await ProjectMutator.load(new ProjectHelper(quickJs), tx, prj);
      mut.doRefresh();
      mut.save();
      await tx.commit();
    });

    await poll(pl, async (tx) => {
      const prjR = await tx.get(prj);
      const outputs = await prjR
        .get(projectFieldName('block3', 'stagingOutput'))
        .then((r) => r.final());
      const all = await outputs.getAllFinal();
      expect(new Set(Object.keys(all))).toEqual(new Set(['opts', 'dependsOnBlocks']));
      const renderingState = await prjR.getKValueObj<ProjectRenderingState>(BlockRenderingStateKey);
      expect(renderingState.blocksInLimbo).toContain('block3');
    });

    await pl.withWriteTx('RenderProduction', async (tx) => {
      const mut = await ProjectMutator.load(new ProjectHelper(quickJs), tx, prj);
      mut.renderProduction(['block1', 'block3']);
      mut.doRefresh();
      mut.save();
      await tx.commit();
    });

    await poll(pl, async (tx) => {
      const prjR = await tx.get(prj);
      const outputs = await prjR
        .get(projectFieldName('block3', 'prodOutput'))
        .then((r) => r.final());
      const v = await outputs.get('sum');
      // there should be an error here telling that one of the upstream blocks not found
      // console.log(Buffer.from(v.data.data!).toString());
      const renderingState = await prjR.getKValueObj<ProjectRenderingState>(BlockRenderingStateKey);
      expect(renderingState.blocksInLimbo).not.toContain('block3');
    });
  });
});

test('simple test #2 with bp migration', async () => {
  const quickJs = await getQuickJS();

  await TestHelpers.withTempRoot(async (pl) => {
    const prj = await pl.withWriteTx('CreatingProject', async (tx) => {
      const prjRef = await createProject(tx);
      tx.createField(field(tx.clientRoot, 'prj'), 'Dynamic', prjRef);
      await tx.commit();
      return await toGlobalResourceId(prjRef);
    });

    await pl.withWriteTx('AddBlock1', async (tx) => {
      const mut = await ProjectMutator.load(new ProjectHelper(quickJs), tx, prj);
      mut.addBlock(
        { id: 'block1', label: 'Block1', renderingMode: 'Heavy' },
        {
          args: JSON.stringify({ numbers: [1, 2, 3] }),
          uiState: "{}",
          blockPack: await TestBPPreparer.prepare(BPSpecEnterV041NotPrepared)
        }
      );
      mut.addBlock(
        { id: 'block2', label: 'Block2', renderingMode: 'Heavy' },
        {
          args: JSON.stringify({ numbers: [3, 4, 5] }),
          uiState: "{}",
          blockPack: await TestBPPreparer.prepare(BPSpecEnterV041NotPrepared)
        }
      );
      mut.addBlock(
        { id: 'block3', label: 'Block3', renderingMode: 'Heavy' },
        {
          args: JSON.stringify({
            sources: [outputRef('block1', 'column'), outputRef('block2', 'column')]
          }),
          uiState: "{}",
          blockPack: await TestBPPreparer.prepare(BPSpecSumV042NotPrepared)
        }
      );
      mut.renderProduction(['block2', 'block3'], true);
      mut.doRefresh();
      mut.save();
      await tx.commit();
    });

    await poll(pl, async (tx) => {
      const prjR = await tx.get(prj);
      const outputs = await prjR
        .get(projectFieldName('block3', 'prodOutput'))
        .then((r) => r.final());
      const all = await outputs.getAllFinal();
      expect(new Set(Object.keys(all))).toEqual(new Set(['sum', 'dependsOnBlocks']));
      const v = await outputs.get('sum');
      console.log(Buffer.from(v.data.data!).toString());
    });

    await poll(pl, async (tx) => {
      const prjR = await tx.get(prj);
      const outputs = await prjR
        .get(projectFieldName('block3', 'stagingOutput'))
        .then((r) => r.final());
      const all = await outputs.getAllFinal();
      expect(new Set(Object.keys(all))).toEqual(new Set(['opts', 'dependsOnBlocks']));
    });

    await pl.withWriteTx('MigrateBlock2', async (tx) => {
      const mut = await ProjectMutator.load(new ProjectHelper(quickJs), tx, prj);
      // TODO change to dev
      mut.migrateBlockPack('block2', await TestBPPreparer.prepare(BPSpecEnterV041NotPrepared));
      mut.save();
      await tx.commit();
    });

    await poll(pl, async (tx) => {
      const prjR = await tx.get(prj);
      expect(prjR.data.fields.map((f) => f.name)).not.toContain(
        projectFieldName('block3', 'stagingOutput')
      );
      const renderingState = await prjR.getKValueObj<ProjectRenderingState>(BlockRenderingStateKey);
      expect(renderingState.blocksInLimbo).toContain('block3');
    });

    await pl.withWriteTx('Refresh', async (tx) => {
      const mut = await ProjectMutator.load(new ProjectHelper(quickJs), tx, prj);
      mut.doRefresh();
      mut.save();
      await tx.commit();
    });

    await poll(pl, async (tx) => {
      const prjR = await tx.get(prj);
      expect(prjR.data.fields.map((f) => f.name)).toContain(
        projectFieldName('block3', 'stagingOutput')
      );
      const renderingState = await prjR.getKValueObj<ProjectRenderingState>(BlockRenderingStateKey);
      expect(renderingState.blocksInLimbo).toContain('block3');
    });
  });
});
