import { PlTreeEntry, PlTreeNodeAccessor } from '@milaboratory/pl-tree';
import { blockFrontendStateKey, projectFieldName } from '../model/project_model';
import { PlResourceEntry, StdCtx } from '@milaboratory/sdk-ui';
import { ComputableCtx } from '@milaboratory/computable';
import { notEmpty } from '@milaboratory/ts-helpers';
import { Optional } from 'utility-types';

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

export type BlockContextArgsOnly = {
  readonly blockId: string;
  readonly args: string;
  readonly uiState: string | undefined;
};

export type BlockContextFull = BlockContextArgsOnly & {
  readonly prod: (cCtx: ComputableCtx) => PlTreeEntry | undefined;
  readonly staging: (cCtx: ComputableCtx) => PlTreeEntry | undefined;
};

export type BlockContextAny = Optional<BlockContextFull, 'prod' | 'staging'>;

export function toCfgContext(ctx: BlockContextAny): MatStdCtx {
  return {
    $blockId: ctx.blockId,
    $args: JSON.parse(ctx.args),
    $ui: ctx.uiState !== undefined ? JSON.parse(ctx.uiState) : undefined,
    $prod: ctx.prod,
    $staging: ctx.staging
  };
}

export function constructBlockContextArgsOnly(
  projectNode: PlTreeNodeAccessor,
  blockId: string
): BlockContextArgsOnly {
  const args = notEmpty(
    projectNode
      .traverse({
        field: projectFieldName(blockId, 'currentArgs'),
        errorIfFieldNotAssigned: true
      })
      .getDataAsString()
  );
  const uiState = projectNode.getKeyValueAsString(blockFrontendStateKey(blockId));
  return { blockId, args, uiState };
}

export function constructBlockContext(
  projectNode: PlTreeNodeAccessor,
  blockId: string
): BlockContextFull {
  const projectEntry = projectNode.persist();
  return {
    ...constructBlockContextArgsOnly(projectNode, blockId),
    prod: (cCtx: ComputableCtx) => {
      return cCtx
        .accessor(projectEntry)
        .node()
        .traverse({
          field: projectFieldName(blockId, 'prodOutput'),
          stableIfNotFound: true,
          ignoreError: true
        })
        ?.persist();
    },
    staging: (cCtx: ComputableCtx) => {
      return cCtx
        .accessor(projectEntry)
        .node()
        .traverse({
          field: projectFieldName(blockId, 'stagingOutput'),
          ignoreError: true
        })
        ?.persist();
    }
  };
}
