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
import type { AuthorMarker, BlockStateInternal } from '@milaboratories/pl-model-middle-layer';
import { computableFromCfgOrRF } from './render';
import { resourceIdToString } from '@milaboratories/pl-client';

export type BlockArgsAndUiState = Omit<BlockStateInternal, 'outputs' | 'navigationState'>;

export function blockArgsAndUiState(
  projectEntry: PlTreeEntry,
  blockId: string
): Computable<BlockArgsAndUiState>;
export function blockArgsAndUiState(
  projectEntry: PlTreeEntry,
  blockId: string,
  cCtx: ComputableCtx
): BlockArgsAndUiState;
export function blockArgsAndUiState(
  projectEntry: PlTreeEntry,
  blockId: string,
  cCtx?: ComputableCtx,
): BlockArgsAndUiState | Computable<BlockArgsAndUiState> {
  if (cCtx === undefined)
    return Computable.make((c) => blockArgsAndUiState(projectEntry, blockId, c), {
      key: `inputs#${resourceIdToString(projectEntry.rid)}#${blockId}`,
    });

  const prj = cCtx.accessor(projectEntry).node();
  const ctx = constructBlockContextArgsOnly(projectEntry, blockId);
  const uiState = ctx.uiState(cCtx);
  return {
    author: prj.getKeyValueAsJson<AuthorMarker>(blockArgsAuthorKey(blockId)),
    args: JSON.parse(ctx.args(cCtx)),
    ui: uiState !== undefined ? JSON.parse(uiState) : undefined,
  };
}

export function blockOutputs(
  projectEntry: PlTreeEntry,
  blockId: string,
  env: MiddleLayerEnvironment,
): ComputableStableDefined<Record<string, ComputableValueOrErrors<unknown>>> {
  return Computable.make(
    (c) => {
      const prj = c.accessor(projectEntry).node();
      const ctx = constructBlockContext(projectEntry, blockId);

      return ifNotUndef(getBlockPackInfo(prj, blockId), ({ cfg, bpId }) => {
        const outputs: Record<string, Computable<any>> = {};
        for (const [cellId, cellCfg] of Object.entries(cfg.outputs)) {
          const computableOutput = computableFromCfgOrRF(env, ctx, cellCfg, cfg.code, bpId);
          outputs[cellId] = Computable.wrapError(computableOutput, 1, true /* stringify to string, for keeping old blocks work with new UI. */);
        }
        return outputs;
      });
    },
    { key: 'outputs#' + resourceIdToString(projectEntry.rid) + '#' + blockId },
  ).withStableType();
}
