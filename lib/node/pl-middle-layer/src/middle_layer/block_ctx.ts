import { PlTreeEntry, PlTreeNodeAccessor } from '@milaboratory/pl-tree';
import { blockFrontendStateKey, projectFieldName } from '../model/project_model';
import { PlResourceEntry, StdCtx } from '@milaboratory/sdk-ui';
import { ComputableCtx } from '@milaboratory/computable';

type SC = StdCtx<unknown, unknown>;
type SCAO = Pick<SC, '$ui' | '$args'>;
export type MatStdCtxArgsOnly = {
  [Var in keyof SCAO]: SCAO[Var] extends PlResourceEntry
    ? PlTreeEntry | ((cCtx: ComputableCtx) => PlTreeEntry | undefined) | undefined
    : SCAO[Var];
}
export type MatStdCtx = {
  [Var in keyof SC]: SC[Var] extends PlResourceEntry
    ? PlTreeEntry | ((cCtx: ComputableCtx) => PlTreeEntry | undefined) | undefined
    : SC[Var];
}

export function constructBlockContextArgsOnly(projectNode: PlTreeNodeAccessor, blockId: string): MatStdCtxArgsOnly {
  const args = projectNode.traverse({
    field: projectFieldName(blockId, 'currentArgs'),
    errorIfFieldNotAssigned: true
  }).getDataAsJson();
  const ui = projectNode.getKeyValueAsJson(blockFrontendStateKey(blockId));
  return {
    $args: args,
    $ui: ui
  };
}

export function constructBlockContext(projectNode: PlTreeNodeAccessor, blockId: string): MatStdCtx {
  const projectEntry = projectNode.persist();
  const argsCtx = constructBlockContextArgsOnly(projectNode, blockId);
  return {
    ...argsCtx,
    $prod: (cCtx: ComputableCtx) => {
      return cCtx.accessor(projectEntry).node().traverse({
        field: projectFieldName(blockId, 'prodOutput'),
        stableIfNotFound: true,
        ignoreError: true
      })?.persist();
    },
    $staging: (cCtx: ComputableCtx) => {
      return cCtx.accessor(projectEntry).node().traverse({
        field: projectFieldName(blockId, 'stagingOutput'),
        ignoreError: true
      })?.persist();
    }
  };
}
