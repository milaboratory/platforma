import { PlTreeEntry, PlTreeNodeAccessor } from '@milaboratory/pl-tree';
import { MiddleLayerEnvironment } from './middle_layer';
import { blockFrontendStateKey, projectFieldName } from '../model/project_model';
import { PlResourceEntry, StdCtx, StdCtxArgsOnly } from '@milaboratory/sdk-block-config';

type SC = StdCtx<unknown, unknown>;
type SCAO = StdCtxArgsOnly<unknown, unknown>;
export type MatStdCtxArgsOnly = {
  [Var in keyof SCAO]: SCAO[Var] extends PlResourceEntry
    ? PlTreeEntry | undefined
    : SCAO[Var];
}
export type MatStdCtx = {
  [Var in keyof SC]: SC[Var] extends PlResourceEntry
    ? PlTreeEntry | undefined
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
  const argsCtx = constructBlockContextArgsOnly(projectNode, blockId);
  const prodField = projectNode.traverse({
    field: projectFieldName(blockId, 'prodOutput'),
    ignoreError: true
  });
  const stagingField = projectNode.traverse({
    field: projectFieldName(blockId, 'stagingOutput'),
    ignoreError: true
  });
  return {
    ...argsCtx,
    $prod: prodField?.persist(),
    $staging: stagingField?.persist()
  };
}

export function blockOutputCell(projectEntry: PlTreeEntry, blockId: string, env: MiddleLayerEnvironment) {
  // return
}
