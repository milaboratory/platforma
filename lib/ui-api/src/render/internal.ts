import { Branded } from '../branding';
import { CommonFieldTraverseOps, FieldTraversalStep, ResourceType } from './traversal_ops';

export const StagingAccessorName = 'staging';
export const MainAccessorName = 'main';

export type AccessorHandle = Branded<string, 'AccessorHandle'>
export type FutureHandle = Branded<string, 'FutureHandle'>

export interface GlobalCfgRenderCtxMethods<AHandle = AccessorHandle> {
  //
  // Root accessor creation
  //

  getAccessorHandleByName(name: string): AHandle | undefined;

  //
  // Basic resource accessor actions
  //

  resolveWithCommon(handle: AHandle,
                    commonOptions: CommonFieldTraverseOps,
                    ...steps: (FieldTraversalStep | string)[]): AHandle | undefined;

  getResourceType(handle: AHandle): ResourceType;

  getInputsLocked(handle: AHandle): boolean;

  getOutputsLocked(handle: AHandle): boolean;

  getIsReadyOrError(handle: AHandle): boolean;

  getIsFinal(handle: AHandle): boolean;

  getError(handle: AHandle): AHandle | undefined;

  listInputFields(handle: AHandle): string[];

  listOutputFields(handle: AHandle): string[];

  listDynamicFields(handle: AHandle): string[];

  getKeyValue(handle: AHandle, key: string): ArrayBuffer | undefined;

  getKeyValueAsString(handle: AHandle, key: string): string | undefined;

  getData(handle: AHandle): ArrayBuffer | undefined;

  getDataAsString(handle: AHandle): string | undefined;
}

export interface GlobalCfgRenderCtx extends GlobalCfgRenderCtxMethods {
  readonly args: string;
  readonly uiState?: string;
  readonly callbackRegistry: Record<string, Function>;
}
