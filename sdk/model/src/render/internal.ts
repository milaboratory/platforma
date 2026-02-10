import type { Optional } from "utility-types";
import type { Branded } from "../branding";
import type { CommonFieldTraverseOps, FieldTraversalStep, ResourceType } from "./traversal_ops";
import type {
  JoinEntry,
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
  PTableColumnId,
  SingleValuePredicateV2,
  QueryBooleanExpressionSpec,
  QueryExpressionSpec,
  ResultCollection,
  ValueOrError,
  DataInfo,
  RangeBytes,
  QuerySpec,
} from "@milaboratories/pl-model-common";
import { isPColumn } from "@milaboratories/pl-model-common";
import type { TreeNodeAccessor } from "./accessor";

export const StagingAccessorName = "staging";
export const MainAccessorName = "main";

export type AccessorHandle = Branded<string, "AccessorHandle">;
export type FutureHandle = Branded<string, "FutureHandle">;

export type PColumnDataUniversal<TreeEntry = TreeNodeAccessor> =
  | TreeEntry
  | DataInfo<TreeEntry>
  | PColumnValues;

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
    Optional<PObject<ValueOrError<AHandle, Error>>, "id">
  >;

  getSpecsFromResultPool(): ResultCollection<PObjectSpec>;

  getSpecFromResultPoolByRef(blockId: string, exportName: string): PObjectSpec | undefined;

  getDataFromResultPoolByRef(blockId: string, exportName: string): PObject<AHandle> | undefined;

  calculateOptions(predicate: PSpecPredicate): Option[];

  //
  // PFrame / PTable
  //

  createPFrame(def: PFrameDef<PColumn<AHandle | PColumnValues | DataInfo<AHandle>>>): PFrameHandle;

  createPTable(def: PTableDef<PColumn<AHandle | PColumnValues | DataInfo<AHandle>>>): PTableHandle;

  createPTableV2(
    def: PTableDef<PColumn<AHandle | PColumnValues | DataInfo<AHandle>>>,
  ): PTableHandle;

  //
  // Computable
  //

  getCurrentUnstableMarker(): string | undefined;

  //
  // Logging
  //

  logInfo(message: string): void;

  logWarn(message: string): void;

  logError(message: string): void;
}

export const GlobalCfgRenderCtxFeatureFlags = {
  explicitColumnsSupport: true as const,
  inlineColumnsSupport: true as const,
  activeArgs: true as const,
  pTablePartitionFiltersSupport: true as const,
  pFrameInSetFilterSupport: true as const,
};

export interface GlobalCfgRenderCtx extends GlobalCfgRenderCtxMethods {
  //
  // State: Args, UI State, Active Args
  //
  // Old runtime injects these values as strings, new runtime injects them as functions
  // that return strings, if block declares supportsLazyState flag.
  // If function not called in lazy state API, then resulting output will not depend on these values,
  // and thus will not be recalculated on corresponding state change.
  //

  readonly args: string | (() => string);
  /** @deprecated Use `data` instead. Optional for backward compatibility - falls back to `data` if not injected. */
  readonly uiState?: string | (() => string);
  readonly data: string | (() => string);
  readonly activeArgs: undefined | string | (() => string | undefined);

  // Note: strings below are used because, anyway, using strings is the only way
  // to get data inside the QuickJS context, as it is implemented now. With this
  // approach deserialization can be lazily postponed until it is actually needed.
  readonly callbackRegistry: Record<string, AnyFunction>;
  readonly featureFlags?: typeof GlobalCfgRenderCtxFeatureFlags;
}

export type FutureAwait = {
  __awaited_futures__: FutureHandle[];
};

export function isFutureAwait(obj: unknown): obj is FutureAwait {
  return typeof obj === "object" && obj !== null && "__awaited_futures__" in obj;
}

function addAllFutureAwaits(set: Set<string>, visited: Set<unknown>, node: unknown) {
  if (visited.has(node)) return;
  visited.add(node);

  const type = typeof node;
  if (type === "object") {
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

export function joinEntryToQuerySpec(entry: JoinEntry<PColumn<PColumnDataUniversal>>): QuerySpec {
  switch (entry.type) {
    case "column": {
      const col = entry.column;
      if (!isPColumn(col)) {
        throw new Error("Expected PColumn");
      }
      return {
        type: "column",
        columnId: col.id,
      };
    }
    case "inner": {
      const entries = entry.entries.map((e) => ({
        entry: joinEntryToQuerySpec(e),
        qualifications: [],
      }));
      return {
        type: "innerJoin",
        entries,
      };
    }
    case "full": {
      const entries = entry.entries.map((e) => ({
        entry: joinEntryToQuerySpec(e),
        qualifications: [],
      }));
      return {
        type: "fullJoin",
        entries,
      };
    }
    case "outer": {
      const primary = {
        entry: joinEntryToQuerySpec(entry.primary),
        qualifications: [],
      };
      const secondary = entry.secondary.map((e) => ({
        entry: joinEntryToQuerySpec(e),
        qualifications: [],
      }));
      return {
        type: "outerJoin",
        primary,
        secondary,
      };
    }
    default:
      throw new Error(`Unexpected join entry type ${entry.type}`);
  }
}

function pTableColumnIdToQueryExpr(col: PTableColumnId): QueryExpressionSpec {
  if (col.type === "axis") {
    return {
      type: "axisRef",
      value: { name: col.id.name, domain: col.id.domain },
    };
  }
  return { type: "columnRef", value: col.id };
}

function convertPredicateV2(
  colRef: QueryExpressionSpec,
  pred: SingleValuePredicateV2,
): QueryBooleanExpressionSpec {
  switch (pred.operator) {
    case "Equal":
      if (typeof pred.reference === "string") {
        return {
          type: "stringEquals",
          input: colRef,
          value: pred.reference,
          caseInsensitive: false,
        };
      }
      return { type: "isIn", input: colRef, set: [pred.reference] };
    case "IEqual":
      return { type: "stringEquals", input: colRef, value: pred.reference, caseInsensitive: true };
    case "InSet": {
      const refs = pred.references;
      if (refs.length > 0 && typeof refs[0] === "number") {
        return { type: "isIn", input: colRef, set: refs as number[] };
      }
      return { type: "isIn", input: colRef, set: refs as string[] };
    }
    case "StringContains":
      return {
        type: "stringContains",
        input: colRef,
        value: pred.substring,
        caseInsensitive: false,
      };
    case "StringIContains":
      return {
        type: "stringContains",
        input: colRef,
        value: pred.substring,
        caseInsensitive: true,
      };
    case "Matches":
      return { type: "stringRegex", input: colRef, value: pred.regex };
    case "StringContainsFuzzy":
      return {
        type: "stringContainsFuzzy",
        input: colRef,
        value: pred.reference,
        maxEdits: pred.maxEdits,
        caseInsensitive: false,
        substitutionsOnly: pred.substitutionsOnly ?? false,
        wildcard: pred.wildcard ?? null,
      };
    case "StringIContainsFuzzy":
      return {
        type: "stringContainsFuzzy",
        input: colRef,
        value: pred.reference,
        maxEdits: pred.maxEdits,
        caseInsensitive: true,
        substitutionsOnly: pred.substitutionsOnly ?? false,
        wildcard: pred.wildcard ?? null,
      };
    case "Not":
      return { type: "not", input: convertPredicateV2(colRef, pred.operand) };
    case "And":
      return { type: "and", input: pred.operands.map((op) => convertPredicateV2(colRef, op)) };
    case "Or":
      return { type: "or", input: pred.operands.map((op) => convertPredicateV2(colRef, op)) };
    case "IsNA":
    case "Less":
    case "LessOrEqual":
    case "Greater":
    case "GreaterOrEqual":
      throw new Error(`Predicate operator '${pred.operator}' is not yet supported in QuerySpec`);
    default:
      throw new Error(`Unknown predicate operator: ${(pred as { operator: string }).operator}`);
  }
}

export function convertPTableDefToSpecQuery(
  def: PTableDef<PColumn<PColumnDataUniversal>>,
): QuerySpec {
  let specQuery = joinEntryToQuerySpec(def.src);

  for (const filter of def.filters) {
    const colRef = pTableColumnIdToQueryExpr(filter.column);
    specQuery = {
      type: "filter",
      input: specQuery,
      predicate: convertPredicateV2(colRef, filter.predicate),
    };
  }

  if (def.sorting.length > 0) {
    specQuery = {
      type: "sort",
      input: specQuery,
      sortBy: def.sorting.map((s) => ({
        expression: pTableColumnIdToQueryExpr(s.column),
        ascending: s.ascending,
        nullsFirst: s.ascending === s.naAndAbsentAreLeastValues,
      })),
    };
  }

  return specQuery;
}
