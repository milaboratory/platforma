import type { PlTreeEntry } from '@milaboratories/pl-tree';
import type { ComputableStableDefined } from '@milaboratories/computable';
import { Computable } from '@milaboratories/computable';
import type {
  ProjectRenderingState,
  ProjectStructure} from '../model/project_model';
import {
  BlockRenderingStateKey,
  ProjectCreatedTimestamp,
  projectFieldName,
  ProjectLastModifiedTimestamp,
  ProjectMetaKey,
  ProjectStructureAuthorKey,
  ProjectStructureKey
} from '../model/project_model';
import { notEmpty } from '@milaboratories/ts-helpers';
import { allBlocks, productionGraph } from '../model/project_model_util';
import type { MiddleLayerEnvironment } from './middle_layer';
import { Pl } from '@milaboratories/pl-client';
import type {
  AuthorMarker,
  BlockCalculationStatus,
  ProjectMeta,
  ProjectOverview
} from '@milaboratories/pl-model-middle-layer';
import { constructBlockContextArgsOnly } from './block_ctx';
import { ifNotUndef } from '../cfg_render/util';
import type { BlockPackInfo } from '../model/block_pack';
import type { BlockSection} from '@platforma-sdk/model';
import { normalizeBlockConfig } from '@platforma-sdk/model';
import { computableFromCfgOrRF } from './render';
import type { NavigationStates } from './navigation_states';

type BlockInfo = {
  currentArguments: any;
  prod?: ProdState;
};

type CalculationStatus = 'Running' | 'Done';

type ProdState = {
  finished: boolean;

  outputError: boolean;

  outputsError?: string;

  exportsError?: string;

  stale: boolean;

  /** Arguments current production was rendered with. */
  arguments: any;
};

/** Returns derived general project state form the project resource */
export function projectOverview(
  entry: PlTreeEntry,
  navigationStates: NavigationStates,
  env: MiddleLayerEnvironment
): ComputableStableDefined<ProjectOverview> {
  return Computable.make(
    (ctx) => {
      const prj = ctx.accessor(entry).node();

      const created = notEmpty(prj.getKeyValueAsJson<number>(ProjectCreatedTimestamp));
      const lastModified = notEmpty(prj.getKeyValueAsJson<number>(ProjectLastModifiedTimestamp));

      const meta = notEmpty(prj.getKeyValueAsJson<ProjectMeta>(ProjectMetaKey));
      const structure = notEmpty(prj.getKeyValueAsJson<ProjectStructure>(ProjectStructureKey));
      const renderingState = notEmpty(
        prj.getKeyValueAsJson<ProjectRenderingState>(BlockRenderingStateKey)
      );

      const infos = new Map<string, BlockInfo>();
      for (const { id } of allBlocks(structure)) {
        const cInputs = prj.traverse({
          field: projectFieldName(id, 'currentArgs'),
          assertFieldType: 'Dynamic',
          errorIfFieldNotSet: true
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
            errorIfFieldNotFound: true
          });
          const ctx = prj.getField({
            field: projectFieldName(id, 'prodUiCtx'),
            assertFieldType: 'Dynamic',
            errorIfFieldNotFound: true
          });
          prod = {
            arguments: rInputs.getDataAsJson(),
            stale: cInputs.id !== rInputs.id,
            outputError:
              result.error !== undefined ||
              ctx.error !== undefined ||
              result.value?.getError() !== undefined ||
              ctx.value?.getError() !== undefined,
            outputsError:
              result.error?.getDataAsString() ?? result.value?.getError()?.getDataAsString(),
            exportsError: ctx.error?.getDataAsString() ?? ctx.value?.getError()?.getDataAsString(),
            finished:
              ((result.value !== undefined && result.value.getIsReadyOrError()) ||
                (result.error !== undefined && result.error.getIsReadyOrError())) &&
              ((ctx.value !== undefined && ctx.value.getIsReadyOrError()) ||
                (ctx.error !== undefined && ctx.error.getIsReadyOrError()))
          };
        }

        infos.set(id, { currentArguments: cInputs.getDataAsJson(), prod });
      }

      const currentGraph = productionGraph(structure, (id) => infos.get(id)!.currentArguments);

      const limbo = new Set(renderingState.blocksInLimbo);

      const blocks = [...allBlocks(structure)].map(({ id, label, renderingMode }) => {
        const info = notEmpty(infos.get(id));
        const gNode = notEmpty(currentGraph.nodes.get(id));
        let calculationStatus: BlockCalculationStatus = 'NotCalculated';
        if (info.prod !== undefined) {
          if (limbo.has(id)) calculationStatus = 'Limbo';
          else calculationStatus = info.prod.finished ? 'Done' : 'Running';
        }

        // block-pack
        const blockPack = prj.traverse(
          {
            field: projectFieldName(id, 'blockPack'),
            assertFieldType: 'Dynamic',
            errorIfFieldNotSet: true
          },
          { field: Pl.HolderRefField, assertFieldType: 'Input', errorIfFieldNotFound: true }
        );

        // sections
        const bpInfo = blockPack?.getDataAsJson<BlockPackInfo>();
        const { sections, inputsValid, sdkVersion } =
          ifNotUndef(bpInfo?.config, (blockConfU) => {
            const blockConf = normalizeBlockConfig(blockConfU);
            const blockCtxArgsOnly = constructBlockContextArgsOnly(prj, id);
            return {
              sections: computableFromCfgOrRF(
                env,
                blockCtxArgsOnly,
                blockConf.sections,
                blockConf.code
              ) as ComputableStableDefined<BlockSection[]>,
              inputsValid: computableFromCfgOrRF(
                env,
                blockCtxArgsOnly,
                blockConf.inputsValid,
                blockConf.code
              ) as ComputableStableDefined<boolean>,
              sdkVersion: blockConf.sdkVersion
            };
          }) || {};

        const updatedBlockPack = ifNotUndef(bpInfo, (info) =>
          env.blockUpdateWatcher.get(info.source, ctx)
        );

        return {
          id,
          label,
          renderingMode,
          stale: info.prod?.stale !== false || calculationStatus === 'Limbo',
          missingReference: gNode.missingReferences,
          upstreams: [...currentGraph.traverseIdsExcludingRoots('upstream', id)],
          downstreams: [...currentGraph.traverseIdsExcludingRoots('downstream', id)],
          calculationStatus,
          outputErrors: info.prod?.outputError === true,
          outputsError: info.prod?.outputsError,
          exportsError: info.prod?.exportsError,
          sections,
          inputsValid,
          currentBlockPack: bpInfo?.source,
          updatedBlockPack,
          sdkVersion,
          navigationState: navigationStates.getState(id)
        };
      });

      return {
        meta,
        created: new Date(created),
        lastModified: new Date(lastModified),
        authorMarker: prj.getKeyValueAsJson<AuthorMarker>(ProjectStructureAuthorKey),
        blocks
      };
    },
    {
      postprocessValue: (value) => {
        const cantRun = new Set<string>();
        const staleBlocks = new Set<string>();
        return {
          ...value,
          blocks: value.blocks.map((b) => {
            if (!b.inputsValid) cantRun.add(b.id);
            if (b.stale) staleBlocks.add(b.id);
            const stale = b.stale || b.upstreams.findIndex((u) => staleBlocks.has(u)) !== -1;
            const canRun =
              stale &&
              Boolean(b.inputsValid) &&
              !b.missingReference &&
              b.upstreams.findIndex((u) => cantRun.has(u)) === -1;
            return { ...b, canRun, stale };
          })
        };
      }
    }
  ).withStableType();
}
