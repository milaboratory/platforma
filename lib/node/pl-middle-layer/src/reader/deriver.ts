import { PlTreeEntry } from '@milaboratory/pl-tree';
import { Computable, computable } from '@milaboratory/computable';
import {
  BlockRenderingMode, BlockRenderingStateKey, projectFieldName,
  ProjectMeta,
  ProjectMetaKey, ProjectRenderingState,
  ProjectStructure,
  ProjectStructureKey
} from '../model/project_model';
import { notEmpty } from '@milaboratory/ts-helpers';
import { allBlocks, productionGraph } from '../model/project_model_util';

export type BlockProductionStatus =
  | 'NotCalculated'
  | 'Running'
  | 'Error'
  | 'Done'
  | 'Limbo'

export type ProjectState = {
  blocks: BlockState[];
}

export type BlockState = {
  id: string,
  name: string,
  renderingMode: BlockRenderingMode,
  missingReference: boolean;
  stale: boolean;
  calculationStatus: BlockProductionStatus;
}

type CalculationStatus =
  | 'Running'
  | 'Error'
  | 'Done'

export type ProdState = {
  calculationStatus: CalculationStatus
  stale: boolean
  arguments: any
}

type BlockInfo = {
  currentArguments: any,
  prod?: ProdState
}

/** Returns derived general project state form the project resource */
export function projectState(entry: PlTreeEntry): Computable<ProjectState> {
  return computable(entry, {}, a => {
    const prj = a.node();
    if (prj === undefined)
      return undefined;
    const meta = JSON.parse(notEmpty(prj.getKeyValueString(ProjectMetaKey))) as ProjectMeta;
    const structure = JSON.parse(notEmpty(prj.getKeyValueString(ProjectStructureKey))) as ProjectStructure;
    const renderingState = JSON.parse(notEmpty(prj.getKeyValueString(BlockRenderingStateKey))) as ProjectRenderingState;

    const infos = new Map<string, BlockInfo>();
    for (const { id } of allBlocks(structure)) {
      const cInputs = notEmpty(prj.get(projectFieldName(id, 'currentInputs'), 'Dynamic', true)?.value);

      let prod: ProdState | undefined = undefined;

      const rInputs = prj.get(projectFieldName(id, 'prodInputs'), 'Dynamic', false)?.value;
      if (rInputs !== undefined) {
        const result = prj.get(projectFieldName(id, 'prodOutput'), 'Dynamic', true);
        const ctx = prj.get(projectFieldName(id, 'prodCtx'), 'Dynamic', true);
        if (result === undefined || ctx === undefined)
          throw new Error('unexpected project structure');
        prod = {
          arguments: rInputs.getDataAsJson(),
          stale: cInputs.id !== rInputs.id,
          calculationStatus: result.error !== undefined || ctx.error !== undefined || result.value?.getError() !== undefined || ctx.value?.getError() !== undefined
            ? 'Error'
            : (result.value !== undefined && result.value.getIsReadyOrError()) && (ctx.value !== undefined && ctx.value.getIsReadyOrError())
              ? 'Done'
              : 'Running'
        };
      }

      infos.set(id, { currentArguments: cInputs.getDataAsJson(), prod });
    }

    const currentGraph = productionGraph(structure, id => infos.get(id)!.currentArguments);

    const limbo = new Set(renderingState.blocksInLimbo);

    const blocks = [...allBlocks(structure)].map(({ id, name, renderingMode }) => {
      const info = notEmpty(infos.get(id));
      const node = notEmpty(currentGraph.nodes.get(id));
      let calculationStatus: BlockProductionStatus = 'NotCalculated';
      if (info.prod !== undefined) {
        if (limbo.has(id))
          calculationStatus = 'Limbo';
        else
          calculationStatus = info.prod.calculationStatus;
      }
      return {
        id, name, renderingMode,
        stale: info.prod?.stale !== false,
        missingReference: node.missingReferences,
        calculationStatus
      } as BlockState;
    });

    return { blocks };
  });
}
