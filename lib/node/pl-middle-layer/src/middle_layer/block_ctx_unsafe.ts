import type { ComputableCtx } from '@milaboratories/computable';
import type { PlTreeEntry } from '@milaboratories/pl-tree';
import type { PlResourceEntry, StdCtx } from '@platforma-sdk/model';
import type { BlockContextAny } from './block_ctx';

type SC = StdCtx<unknown, unknown>;
type SCAO = Pick<SC, '$blockId' | '$ui' | '$args' | '$data'>;
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
    $args: (cCtx: ComputableCtx) => {
      const args = ctx.args(cCtx);
      return args !== undefined ? JSON.parse(args) as unknown : undefined;
    },
    $ui: (cCtx: ComputableCtx) => {
      const data = ctx.data(cCtx);
      return data !== undefined ? JSON.parse(data) as unknown : undefined;
    },
    $data: (cCtx: ComputableCtx) => {
      const data = ctx.data(cCtx);
      return data !== undefined ? JSON.parse(data) as unknown : undefined;
    },
    $prod: ctx.prod,
    $staging: ctx.staging,
  };
}
