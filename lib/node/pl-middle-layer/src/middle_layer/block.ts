import type { PlTreeEntry } from '@milaboratories/pl-tree';
import type {
  ComputableCtx,
  ComputableStableDefined,
  ComputableValueOrErrors,
} from '@milaboratories/computable';
import {
  Computable,
} from '@milaboratories/computable';
import { constructBlockContext, constructBlockContextArgsOnly } from './block_ctx';
import { blockArgsAuthorKey } from '../model/project_model';
import { ifNotUndef } from '../cfg_render/util';
import type { MiddleLayerEnvironment } from './middle_layer';
import { getBlockPackInfo } from './util';
import type { AuthorMarker, BlockStateInternalV3 } from '@milaboratories/pl-model-middle-layer';
import { computableFromCfgOrRF } from './render';
import { resourceIdToString } from '@milaboratories/pl-client';
import { deepFreeze } from '@milaboratories/ts-helpers';
import { extractCodeWithInfo } from '@platforma-sdk/model';
import { getDebugFlags } from '../debug';

export type BlockParameters = Omit<BlockStateInternalV3, 'outputs' | 'navigationState'>;

export function getBlockParameters(
  projectEntry: PlTreeEntry,
  blockId: string
): Computable<BlockParameters>;
export function getBlockParameters(
  projectEntry: PlTreeEntry,
  blockId: string,
  cCtx: ComputableCtx
): BlockParameters;
export function getBlockParameters(
  projectEntry: PlTreeEntry,
  blockId: string,
  cCtx?: ComputableCtx,
): BlockParameters | Computable<BlockParameters> {
  if (cCtx === undefined)
    return Computable.make((c) => getBlockParameters(projectEntry, blockId, c), {
      key: `inputs#${resourceIdToString(projectEntry.rid)}#${blockId}`,
    });

  const prj = cCtx.accessor(projectEntry).node();
  const ctx = constructBlockContextArgsOnly(projectEntry, blockId);
  const blockStorageJson = ctx.blockStorage(cCtx);
  // Parse raw storage JSON - UI will derive data using sdk/model
  const blockStorage = blockStorageJson !== undefined ? deepFreeze(JSON.parse(blockStorageJson)) : undefined;
  return {
    author: prj.getKeyValueAsJson<AuthorMarker>(blockArgsAuthorKey(blockId)),
    blockStorage,
  };
}

export function blockOutputs(
  projectEntry: PlTreeEntry,
  blockId: string,
  env: MiddleLayerEnvironment,
): ComputableStableDefined<Record<string, ComputableValueOrErrors<unknown>>> {
  const key = 'outputs#' + resourceIdToString(projectEntry.rid) + '#' + blockId;
  return Computable.make(
    (c) => {
      if (getDebugFlags().logOutputRecalculations) {
        console.log(`blockOutput recalculation : ${key} (${c.changeSourceMarker}; ${c.bodyInvocations} invocations)`);
      }

      const prj = c.accessor(projectEntry).node();
      const ctx = constructBlockContext(projectEntry, blockId);

      return ifNotUndef(getBlockPackInfo(prj, blockId), ({ cfg, bpId }) => {
        const outputs: Record<string, Computable<any>> = {};
        for (const [cellId, cellCfg] of Object.entries(cfg.outputs)) {
          const computableOutput = computableFromCfgOrRF(env, ctx, cellCfg, extractCodeWithInfo(cfg), bpId);
          outputs[cellId] = Computable.wrapError(computableOutput, 1);
        }
        return outputs;
      });
    },
    { key },
  ).withStableType();
}
