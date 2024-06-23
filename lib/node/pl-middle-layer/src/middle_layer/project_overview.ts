import { PlTreeEntry } from '@milaboratory/pl-tree';
import { Computable, ComputableStableDefined } from '@milaboratory/computable';
import {
  BlockRenderingStateKey, ProjectCreatedTimestamp,
  projectFieldName, ProjectLastModifiedTimestamp,
  ProjectMetaKey,
  ProjectRenderingState,
  ProjectStructure,
  ProjectStructureKey
} from '../model/project_model';
import { notEmpty } from '@milaboratory/ts-helpers';
import { allBlocks, productionGraph } from '../model/project_model_util';
import { MiddleLayerEnvironment } from './middle_layer';
import { Pl } from '@milaboratory/pl-client-v2';
import { BlockProductionStatus, BlockSection, ProjectMeta, ProjectOverview } from '@milaboratory/sdk-ui';
import { constructBlockContextArgsOnly } from './block_ctx';
import { computableFromCfg } from '../cfg_render/executor';
import { ifNotUndef } from '../cfg_render/util';
import { BlockPackInfo } from '../model/block_pack';

type BlockInfo = {
  currentArguments: any,
  prod?: ProdState
}


type CalculationStatus =
  | 'Running'
  | 'Error'
  | 'Done'

type ProdState = {

  calculationStatus: CalculationStatus

  stale: boolean

  /** Arguments current production was rendered with. */
  arguments: any
}


/** Returns derived general project state form the project resource */
export function projectOverview(entry: PlTreeEntry, env: MiddleLayerEnvironment): ComputableStableDefined<ProjectOverview> {
  return Computable.make(ctx => {
    const prj = ctx.accessor(entry).node();

    const created = notEmpty(prj.getKeyValueAsJson<number>(ProjectCreatedTimestamp));
    const lastModified = notEmpty(prj.getKeyValueAsJson<number>(ProjectLastModifiedTimestamp));

    const meta = notEmpty(prj.getKeyValueAsJson<ProjectMeta>(ProjectMetaKey));
    const structure = notEmpty(prj.getKeyValueAsJson<ProjectStructure>(ProjectStructureKey));
    const renderingState = notEmpty(prj.getKeyValueAsJson<ProjectRenderingState>(BlockRenderingStateKey));

    const infos = new Map<string, BlockInfo>();
    for (const { id } of allBlocks(structure)) {
      const cInputs = prj.traverse({
        field: projectFieldName(id, 'currentArgs'),
        assertFieldType: 'Dynamic', errorIfFieldNotAssigned: true
      });

      let prod: ProdState | undefined = undefined;

      const rInputs = prj.traverse({
        field: projectFieldName(id, 'prodArgs'),
        assertFieldType: 'Dynamic',
        stableIfNotFound: true
      });
      if (rInputs !== undefined) {
        const result = prj.getField({
          field: projectFieldName(id, 'prodOutput'),
          assertFieldType: 'Dynamic',
          stableIfNotFound: true,
          errorIfFieldNotFound: true
        });
        const ctx = prj.getField({
          field: projectFieldName(id, 'prodCtx'),
          assertFieldType: 'Dynamic',
          stableIfNotFound: true,
          errorIfFieldNotFound: true
        });
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

    const blocks = [...allBlocks(structure)].map(({ id, label, renderingMode }) => {
      const info = notEmpty(infos.get(id));
      const gNode = notEmpty(currentGraph.nodes.get(id));
      let calculationStatus: BlockProductionStatus = 'NotCalculated';
      if (info.prod !== undefined) {
        if (limbo.has(id))
          calculationStatus = 'Limbo';
        else
          calculationStatus = info.prod.calculationStatus;
      }

      // block-pack
      const blockPack = prj.traverse(
        { field: projectFieldName(id, 'blockPack'), assertFieldType: 'Dynamic', errorIfFieldNotAssigned: true },
        { field: Pl.HolderRefField, assertFieldType: 'Input', errorIfFieldNotFound: true }
      );

      // sections
      const bpInfo = blockPack?.getDataAsJson<BlockPackInfo>();
      const { sections, canRun } = ifNotUndef(bpInfo?.config,
        blockConf => {
          const blockCtxArgsOnly = constructBlockContextArgsOnly(prj, id);
          return {
            sections: computableFromCfg(env.drivers, blockCtxArgsOnly, blockConf.sections) as ComputableStableDefined<BlockSection[]>,
            canRun: computableFromCfg(env.drivers, blockCtxArgsOnly, blockConf.canRun) as ComputableStableDefined<boolean>
          };
        }) || {};

      return {
        id, label, renderingMode,
        stale: info.prod?.stale !== false,
        missingReference: gNode.missingReferences,
        calculationStatus, sections, canRun, blockPackSource: bpInfo?.source
      };
    });

    return {
      meta, created: new Date(created), lastModified: new Date(lastModified), blocks
    };
  }).withStableType();
}
