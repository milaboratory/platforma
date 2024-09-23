import { ComputableCtx } from '@milaboratories/computable';
import { PlTreeEntry } from '@milaboratories/pl-tree';
import { PlResourceEntry, StdCtx } from '@platforma-sdk/model';
import { BlockContextAny } from './block_ctx';

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
    $args: JSON.parse(ctx.args),
    $ui: ctx.uiState !== undefined ? JSON.parse(ctx.uiState) : undefined,
    $prod: ctx.prod,
    $staging: ctx.staging
  };
}
