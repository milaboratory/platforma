import type { ComputableCtx } from '@milaboratories/computable';
import type { PlTreeEntry } from '@milaboratories/pl-tree';
import type { PlResourceEntry, StdCtx } from '@platforma-sdk/model';
import type { BlockContextAny } from './block_ctx';

type SC = StdCtx<unknown, unknown>;
type SCAO = Pick<SC, '$blockId' | '$ui' | '$args'>;
export type MatStdCtxArgsOnly = {
  [Var in keyof SCAO]: SCAO[Var] extends PlResourceEntry
    ? PlTreeEntry | ((cCtx: ComputableCtx) => PlTreeEntry | undefined) | undefined
    : SCAO[Var];
};
export type MatStdCtx = {
  [Var in keyof SC]: SC[Var] extends PlResourceEntry
    ? PlTreeEntry | ((cCtx: ComputableCtx) => PlTreeEntry | undefined) | undefined
    : SC[Var];
};

export const NonKeyCtxFields = ['$prod', '$staging'];

export function toCfgContext(ctx: BlockContextAny): MatStdCtx {
  return {
    $blockId: ctx.blockId,
    $args: (cCtx: ComputableCtx) => JSON.parse(ctx.args(cCtx)) as unknown,
    $ui: (cCtx: ComputableCtx) => {
      const uiState = ctx.uiState(cCtx);
      return uiState !== undefined ? JSON.parse(uiState) as unknown : undefined;
    },
    $prod: ctx.prod,
    $staging: ctx.staging,
  };
}
