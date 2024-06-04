import { field, TestHelpers, toGlobalResourceId } from '@milaboratory/pl-client-v2';
import { createProject, loadProject } from '../mutator/project';
import { outputRef } from '../model/args';
import { SynchronizedTreeState } from '@milaboratory/pl-tree';
import { projectState } from './deriver';
import { BPSpecEnterV020NotPrepared, BPSpecSumV020NotPrepared, TestBPPreparer } from '../test/block_packs';

test('simple test #2 using computable project state', async () => {
  await TestHelpers.withTempRoot(async pl => {
    const prj = await pl.withWriteTx('CreatingProject', async tx => {
      const prjRef = createProject(tx);
      tx.createField(field(tx.clientRoot, 'prj'), 'Dynamic', prjRef);
      await tx.commit();
      return await toGlobalResourceId(prjRef);
    });

    const projectTreeState = new SynchronizedTreeState(pl, prj, { pollingInterval: 300, stopPollingDelay: 1000 });
    const computableState = projectState(projectTreeState.accessor());
    await computableState.getValue();

    await pl.withWriteTx('AddBlock1', async tx => {
      const mut = await loadProject(tx, prj);
      mut.addBlock({ id: 'block1', name: 'Block1', renderingMode: 'Heavy' },
        {
          inputs: JSON.stringify({ numbers: [1, 2, 3] }),
          blockPack: await TestBPPreparer.prepare(BPSpecEnterV020NotPrepared)
        }
      );
      mut.addBlock({ id: 'block2', name: 'Block2', renderingMode: 'Heavy' },
        {
          inputs: JSON.stringify({ numbers: [3, 4, 5] }),
          blockPack: await TestBPPreparer.prepare(BPSpecEnterV020NotPrepared)
        }
      );
      mut.addBlock({ id: 'block3', name: 'Block3', renderingMode: 'Heavy' },
        {
          inputs: JSON.stringify({
            sources: [
              outputRef('block1', 'column'),
              outputRef('block2', 'column')
            ]
          }),
          blockPack: await TestBPPreparer.prepare(BPSpecSumV020NotPrepared)
        }
      );
      mut.renderProduction(['block1', 'block2', 'block3']);
      mut.doRefresh();
      mut.save();
      await tx.commit();
    });

    await computableState.refreshState();

    while (true) {
      const value = await computableState.getValue();
      const block3 = value.blocks.find(b => b.id === 'block3');
      expect(block3).toBeDefined();
      const calculationStatus = block3!.calculationStatus;
      if (calculationStatus === 'Done')
        break;
      await computableState.listen();
    }

    await pl.withWriteTx('MigrateBlock2', async tx => {
      const mut = await loadProject(tx, prj);
      // TODO migrate to dev
      mut.migrateBlockPack('block2', await TestBPPreparer.prepare(BPSpecEnterV020NotPrepared));
      mut.save();
      await tx.commit();
    });

    {
      await computableState.refreshState();

      const value = await computableState.getValue();
      const block3 = value.blocks.find(b => b.id === 'block3');
      expect(block3).toBeDefined();
      const calculationStatus = block3!.calculationStatus;
      expect(calculationStatus).toEqual('Limbo');
    }

    await pl.withWriteTx('Refresh', async tx => {
      const mut = await loadProject(tx, prj);
      mut.renderProduction(['block1', 'block2', 'block3']);
      mut.doRefresh();
      mut.save();
      await tx.commit();
    });

    await computableState.refreshState();

    while (true) {
      const value = await computableState.getValue();
      const block3 = value.blocks.find(b => b.id === 'block3');
      expect(block3).toBeDefined();
      const calculationStatus = block3!.calculationStatus;
      if (calculationStatus === 'Done')
        break;
      await computableState.listen();
    }
  });
});
