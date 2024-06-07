import { PlTreeEntry, PlTreeNodeAccessor } from '@milaboratory/pl-tree';
import { MiddleLayerEnvironment } from './middle_layer';
import { blockFrontendStateKey, projectFieldName } from '../model/project_model';
import { PlResourceEntry, StdCtx } from '@milaboratory/sdk-block-config';

type SC = StdCtx<unknown, unknown>;
export type MatStdCtx = {
  [Var in keyof SC]: SC[Var] extends PlResourceEntry
    ? PlTreeEntry | undefined
    : SC[Var];
}

export function constructBlockContext(projectNode: PlTreeNodeAccessor, blockId: string, env: MiddleLayerEnvironment): MatStdCtx {
  const argsField = projectNode.get(projectFieldName(blockId, 'currentInputs'));
  if (argsField === undefined)
    throw new Error('No such block');
  const args = argsField.value!.getDataAsJson();
  const ui = projectNode.getKeyValueAsJson(blockFrontendStateKey(blockId));
  const prodField = projectNode.get(projectFieldName(blockId, 'prodOutput'));
  const stagingField = projectNode.get(projectFieldName(blockId, 'stagingOutput'));
  return {
    $args: args,
    $ui: ui,
    $prod: prodField?.value?.persist(),
    $staging: stagingField?.value?.persist()
  };
}

export function blockOutputCell(projectEntry: PlTreeEntry, blockId: string, env: MiddleLayerEnvironment) {
  // return
}
