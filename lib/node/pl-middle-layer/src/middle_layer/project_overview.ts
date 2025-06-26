import type { PlTreeEntry } from '@milaboratories/pl-tree';
import type { ComputableStableDefined } from '@milaboratories/computable';
import { Computable } from '@milaboratories/computable';
import type {
  ProjectRenderingState,
  ProjectStructure } from '../model/project_model';
import {
  BlockRenderingStateKey,
  ProjectCreatedTimestamp,
  projectFieldName,
  ProjectLastModifiedTimestamp,
  ProjectMetaKey,
  ProjectStructureAuthorKey,
  ProjectStructureKey,
} from '../model/project_model';
import { notEmpty } from '@milaboratories/ts-helpers';
import { allBlocks, productionGraph } from '../model/project_model_util';
import type { MiddleLayerEnvironment } from './middle_layer';
import type {
  AuthorMarker,
  BlockCalculationStatus,
  BlockSettings,
  ProjectMeta,
  ProjectOverview,
} from '@milaboratories/pl-model-middle-layer';
import { constructBlockContextArgsOnly } from './block_ctx';
import { ifNotUndef } from '../cfg_render/util';
import { extractCodeWithInfo, type BlockSection } from '@platforma-sdk/model';
import { computableFromCfgOrRF } from './render';
import type { NavigationStates } from './navigation_states';
import { getBlockPackInfo } from './util';
import { resourceIdToString, type ResourceId } from '@milaboratories/pl-client';
import * as R from 'remeda';
import { getRuntimeCapabilities } from './runtime_capabilities';

type BlockInfo = {
  argsRid: ResourceId;
  currentArguments: unknown;
  prod?: ProdState;
};

type _CalculationStatus = 'Running' | 'Done';

type ProdState = {
  finished: boolean;

  outputError: boolean;

  outputsError?: string;

  exportsError?: string;

  stale: boolean;

  /** Arguments current production was rendered with. */
  arguments: Record<string, unknown>;
};

function argsEquals(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  const clean = R.omitBy<Record<string, unknown>>((_, key) => key.startsWith('__'));
  return R.isDeepEqual(clean(a), clean(b));
}

/** Returns derived general project state form the project resource */
export function projectOverview(
  prjEntry: PlTreeEntry,
  navigationStates: NavigationStates,
  env: MiddleLayerEnvironment,
): ComputableStableDefined<ProjectOverview> {
  return Computable.make(
    (ctx) => {
      const prj = ctx.accessor(prjEntry).node();

      const created = notEmpty(prj.getKeyValueAsJson<number>(ProjectCreatedTimestamp));
      const lastModified = notEmpty(prj.getKeyValueAsJson<number>(ProjectLastModifiedTimestamp));

      const meta = notEmpty(prj.getKeyValueAsJson<ProjectMeta>(ProjectMetaKey));
      const structure = notEmpty(prj.getKeyValueAsJson<ProjectStructure>(ProjectStructureKey));
      const renderingState = notEmpty(
        prj.getKeyValueAsJson<ProjectRenderingState>(BlockRenderingStateKey),
      );

      const infos = new Map<string, BlockInfo>();
      for (const { id } of allBlocks(structure)) {
        const cInputs = prj.traverse({
          field: projectFieldName(id, 'currentArgs'),
          assertFieldType: 'Dynamic',
          errorIfFieldNotSet: true,
        });
        const currentArguments = cInputs.getDataAsJson() as Record<string, unknown>;

        let prod: ProdState | undefined = undefined;

        const rInputs = prj.traverse({
          field: projectFieldName(id, 'prodArgs'),
          assertFieldType: 'Dynamic',
          stableIfNotFound: true,
        });
        if (rInputs !== undefined) {
          const prodArgs = rInputs.getDataAsJson() as Record<string, unknown>;
          const result = prj.getField({
            field: projectFieldName(id, 'prodOutput'),
            assertFieldType: 'Dynamic',
            errorIfFieldNotFound: true,
          });
          const ctx = prj.getField({
            field: projectFieldName(id, 'prodUiCtx'),
            assertFieldType: 'Dynamic',
            errorIfFieldNotFound: true,
          });
          prod = {
            arguments: prodArgs,
            stale: !argsEquals(currentArguments, prodArgs),
            outputError:
              result.error !== undefined
              || ctx.error !== undefined
              || result.value?.getError() !== undefined
              || ctx.value?.getError() !== undefined,
            outputsError:
              result.error?.getDataAsString() ?? result.value?.getError()?.getDataAsString(),
            exportsError: ctx.error?.getDataAsString() ?? ctx.value?.getError()?.getDataAsString(),
            finished:
              ((result.value !== undefined && result.value.getIsReadyOrError())
                || (result.error !== undefined && result.error.getIsReadyOrError()))
              && ((ctx.value !== undefined && ctx.value.getIsReadyOrError())
                || (ctx.error !== undefined && ctx.error.getIsReadyOrError())),
          };
        }

        infos.set(id, { currentArguments, prod, argsRid: cInputs.resourceInfo.id });
      }

      const currentGraph = productionGraph(structure, (id) => {
        const bpInfo = getBlockPackInfo(prj, id)!;
        const bInfo = infos.get(id)!;
        const args = bInfo.currentArguments;
        return {
          args,
          enrichmentTargets: env.projectHelper.getEnrichmentTargets(() => bpInfo.cfg, () => args, { argsRid: bInfo.argsRid, blockPackRid: bpInfo.bpResourceId }),
        };
      });

      const limbo = new Set(renderingState.blocksInLimbo);

      const blocks = [...allBlocks(structure)].map(({ id, label: defaultLabel, renderingMode }) => {
        const info = notEmpty(infos.get(id));
        const gNode = notEmpty(currentGraph.nodes.get(id));
        let calculationStatus: BlockCalculationStatus = 'NotCalculated';
        if (info.prod !== undefined) {
          if (limbo.has(id)) calculationStatus = 'Limbo';
          else calculationStatus = info.prod.finished ? 'Done' : 'Running';
        }

        const bp = getBlockPackInfo(prj, id);

        const { sections, title, inputsValid, sdkVersion, featureFlags, isIncompatibleWithRuntime }
          = ifNotUndef(bp, ({ bpId, cfg }) => {
            if (!getRuntimeCapabilities().checkCompatibility(cfg.featureFlags)) {
              return {
                isIncompatibleWithRuntime: true,
              };
            }
            const blockCtxArgsOnly = constructBlockContextArgsOnly(prjEntry, id);
            const codeWithInfo = extractCodeWithInfo(cfg);
            return {
              sections: computableFromCfgOrRF(
                env,
                blockCtxArgsOnly,
                cfg.sections,
                codeWithInfo,
                bpId,
              ).wrap({
                recover: (e) => {
                  env.logger.error('Error in block model sections');
                  env.logger.error(e);
                  return [];
                },
              }) as ComputableStableDefined<BlockSection[]>,
              title: ifNotUndef(
                cfg.title,
                (title) =>
                  computableFromCfgOrRF(
                    env,
                    blockCtxArgsOnly,
                    title,
                    codeWithInfo,
                    bpId,
                  ).wrap({
                    recover: (e) => {
                      env.logger.error('Error in block model title');
                      env.logger.error(e);
                      return 'Invalid title';
                    },
                  }) as ComputableStableDefined<string>,
              ),
              inputsValid: computableFromCfgOrRF(
                env,
                blockCtxArgsOnly,
                cfg.inputsValid,
                codeWithInfo,
                bpId,
              ).wrap({
                recover: (e) => {
                  // I'm not sure that we should write an error here, because it just means "Invalid args"
                  env.logger.error('Error in block model argsValid');
                  env.logger.error(e);
                  return false;
                },
              }) as ComputableStableDefined<boolean>,
              sdkVersion: codeWithInfo?.sdkVersion,
              featureFlags: codeWithInfo?.featureFlags ?? {},
              isIncompatibleWithRuntime: false,
            };
          }) || {};

        const settings = prj
          .traverse({
            field: projectFieldName(id, 'blockSettings'),
            assertFieldType: 'Dynamic',
            errorIfFieldNotSet: true,
          })
          .getDataAsJson() as BlockSettings;

        const updates = ifNotUndef(bp, ({ info }) =>
          env.blockUpdateWatcher.get({ currentSpec: info.source, settings }),
        );

        return {
          projectResourceId: resourceIdToString(prjEntry.rid),
          id,
          label: title ?? defaultLabel,
          title: title ?? defaultLabel,
          renderingMode,
          stale: info.prod?.stale !== false || calculationStatus === 'Limbo',
          missingReference: gNode.missingReferences,
          upstreams: [...currentGraph.traverseIdsExcludingRoots('upstream', id)],
          downstreams: [...currentGraph.traverseIdsExcludingRoots('downstream', id)],
          calculationStatus,
          outputErrors: info.prod?.outputError === true,
          outputsError: info.prod?.outputsError,
          exportsError: info.prod?.exportsError,
          settings,
          sections,
          inputsValid,
          updateInfo: {},
          currentBlockPack: bp?.info?.source,
          updates,
          sdkVersion,
          featureFlags,
          isIncompatibleWithRuntime,
          navigationState: navigationStates.getState(id),
        };
      });

      return {
        meta,
        created: new Date(created),
        lastModified: new Date(lastModified),
        authorMarker: prj.getKeyValueAsJson<AuthorMarker>(ProjectStructureAuthorKey),
        blocks,
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
            const canRun
              = (stale || b.outputErrors)
              && Boolean(b.inputsValid)
              && !b.missingReference
              && b.upstreams.findIndex((u) => cantRun.has(u)) === -1;
            const bb = {
              ...b,
              canRun,
              stale,
              updateSuggestions: b.updates?.suggestions ?? [],
              updatedBlockPack: b.updates?.mainSuggestion,
            };
            delete bb['updates'];
            return bb;
          }),
        };
      },
    },
  ).withStableType();
}
