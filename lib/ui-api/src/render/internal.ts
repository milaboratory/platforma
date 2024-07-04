import { Branded } from '../branding';
import { CommonFieldTraverseOps, FieldTraversalStep, ResourceType } from './traversal_ops';
import { LocalBlobHandleAndSize, RemoteBlobHandleAndSize } from '@milaboratory/sdk-model';

export const StagingAccessorName = 'staging';
export const MainAccessorName = 'main';

export type AccessorHandle = Branded<string, 'AccessorHandle'>
export type FutureHandle = Branded<string, 'FutureHandle'>

export interface GlobalCfgRenderCtxMethods<AHandle = AccessorHandle, FHandle = FutureHandle> {
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

  getKeyValueBase64(handle: AHandle, key: string): string | undefined;

  getKeyValueAsString(handle: AHandle, key: string): string | undefined;

  getDataBase64(handle: AHandle): string | undefined;

  getDataAsString(handle: AHandle): string | undefined;

  //
  // Blob
  //

  getBlobContentAsBase64(handle: AHandle): FHandle; // string | undefined

  getBlobContentAsString(handle: AHandle): FHandle; // string | undefined

  getDownloadedBlobContentHandle(handle: AHandle): FHandle; // LocalBlobHandleAndSize | undefined;

  getOnDemandBlobContentHandle(handle: AHandle): FHandle; // RemoteBlobHandleAndSize | undefined;
}

export interface GlobalCfgRenderCtx extends GlobalCfgRenderCtxMethods {
  readonly args: string;
  readonly uiState?: string;
  readonly callbackRegistry: Record<string, Function>;
}

export type FutureAwait = {
  __awaited_futures__: FutureHandle[];
};

export function isFutureAwait(obj: unknown): obj is FutureAwait {
  return typeof obj === 'object' && obj !== null && '__awaited_futures__' in obj;
}

function addAllFutureAwaits(set: Set<string>, visited: Set<unknown>, node: unknown) {
  if (visited.has(node))
    return;
  visited.add(node);

  const type = typeof node;
  if (type === 'object') {
    if (isFutureAwait(node))

      node.__awaited_futures__.forEach(a => set.add(a));

    else if (Array.isArray(node))

      for (const nested of node)
        addAllFutureAwaits(set, visited, nested);

    else

      for (const [, nested] of Object.entries(node as object))
        if (nested !== node)
          addAllFutureAwaits(set, visited, nested);
  }
}

export function getAllFutureAwaits(obj: unknown): Set<string> {
  const set = new Set<string>();
  addAllFutureAwaits(set, new Set(), obj);
  return set;
}
