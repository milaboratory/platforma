import type { Optional } from 'utility-types';
import type { Branded } from '../branding';
import type { CommonFieldTraverseOps, FieldTraversalStep, ResourceType } from './traversal_ops';
import type {
  ArchiveFormat,
  AnyFunction,
  Option,
  PColumn,
  PColumnValues,
  PFrameDef,
  PFrameHandle,
  PObject,
  PObjectSpec,
  PSpecPredicate,
  PTableDef,
  PTableHandle,
  ResultCollection,
  ValueOrError,
  DataInfo,
  RangeBytes,
} from '@milaboratories/pl-model-common';

export const StagingAccessorName = 'staging';
export const MainAccessorName = 'main';

export type AccessorHandle = Branded<string, 'AccessorHandle'>;
export type FutureHandle = Branded<string, 'FutureHandle'>;

export interface GlobalCfgRenderCtxMethods<AHandle = AccessorHandle, FHandle = FutureHandle> {
  //
  // Root accessor creation
  //

  getAccessorHandleByName(name: string): AHandle | undefined;

  //
  // Basic resource accessor actions
  //

  resolveWithCommon(
    handle: AHandle,
    commonOptions: CommonFieldTraverseOps,
    ...steps: (FieldTraversalStep | string)[]
  ): AHandle | undefined;

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

  /** If not final returns undefined */
  parsePObjectCollection(
    handle: AHandle,
    errorOnUnknownField: boolean,
    prefix: string,
    ...resolvePath: string[]
  ): Record<string, PObject<AHandle>> | undefined;

  //
  // Blob
  //

  getBlobContentAsBase64(handle: AHandle, range?: RangeBytes): FHandle; // string | undefined

  getBlobContentAsString(handle: AHandle, range?: RangeBytes): FHandle; // string | undefined

  getDownloadedBlobContentHandle(handle: AHandle): FHandle; // LocalBlobHandleAndSize | undefined;

  getOnDemandBlobContentHandle(handle: AHandle): FHandle; // RemoteBlobHandleAndSize | undefined;

  //
  // Blobs to URLs
  //

  extractArchiveAndGetURL(handle: AHandle, format: ArchiveFormat): FHandle;

  //
  // Import progress
  //

  getImportProgress(handle: AHandle): FHandle; // ImportProgress;

  //
  // Logs
  //

  getLastLogs(handle: AHandle, nLines: number): FHandle; // string | undefined;

  getProgressLog(handle: AHandle, patternToSearch: string): FHandle; // string | undefined;

  getProgressLogWithInfo(handle: AHandle, patternToSearch: string): FHandle; // ProgressLogWithInfo | undefined;

  getLogHandle(handle: AHandle): FHandle; // AnyLogHandle | undefined;

  //
  // Blocks
  //

  /** @deprecated at some point will stop working and will return dummy values */
  getBlockLabel(blockId: string): string;

  //
  // Result Pool
  //

  getDataFromResultPool(): ResultCollection<PObject<AHandle>>;

  getDataWithErrorsFromResultPool(): ResultCollection<
    Optional<PObject<ValueOrError<AHandle, Error>>, 'id'>
  >;

  getSpecsFromResultPool(): ResultCollection<PObjectSpec>;

  getSpecFromResultPoolByRef(blockId: string, exportName: string): PObjectSpec | undefined;

  getDataFromResultPoolByRef(blockId: string, exportName: string): PObject<AHandle> | undefined;

  calculateOptions(predicate: PSpecPredicate): Option[];

  //
  // PFrame / PTable
  //

  createPFrame(def: PFrameDef<AHandle | PColumnValues | DataInfo<AHandle>>): PFrameHandle;

  createPTable(def: PTableDef<PColumn<AHandle | PColumnValues | DataInfo<AHandle>>>): PTableHandle;

  //
  // Computable
  //

  getCurrentUnstableMarker(): string | undefined;
}

export const GlobalCfgRenderCtxFeatureFlags = {
  explicitColumnsSupport: true as const,
  inlineColumnsSupport: true as const,
  activeArgs: true as const,
};

export interface GlobalCfgRenderCtx extends GlobalCfgRenderCtxMethods {
  // Note: strings below are used because, anyway, using strings is the only way
  // to get data inside the QuickJS context, as it is implemented now. With this
  // approach deserialization can be lazily postponed until it is actually needed.
  readonly args: string;
  readonly uiState: string;
  readonly activeArgs?: string;
  readonly callbackRegistry: Record<string, AnyFunction>;
  readonly featureFlags?: typeof GlobalCfgRenderCtxFeatureFlags;
}

export type FutureAwait = {
  __awaited_futures__: FutureHandle[];
};

export function isFutureAwait(obj: unknown): obj is FutureAwait {
  return typeof obj === 'object' && obj !== null && '__awaited_futures__' in obj;
}

function addAllFutureAwaits(set: Set<string>, visited: Set<unknown>, node: unknown) {
  if (visited.has(node)) return;
  visited.add(node);

  const type = typeof node;
  if (type === 'object') {
    if (isFutureAwait(node)) node.__awaited_futures__.forEach((a) => set.add(a));
    else if (Array.isArray(node))
      for (const nested of node) addAllFutureAwaits(set, visited, nested);
    else
      for (const [, nested] of Object.entries(node as object))
        if (nested !== node) addAllFutureAwaits(set, visited, nested);
  }
}

export function getAllFutureAwaits(obj: unknown): Set<string> {
  const set = new Set<string>();
  addAllFutureAwaits(set, new Set(), obj);
  return set;
}
