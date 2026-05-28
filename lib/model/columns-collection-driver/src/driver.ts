import type {
  AccessorHandle,
  AccessorLike,
  AnchorEntry,
  AxisQualification,
  CollectionHandle,
  ColumnEntriesProvider,
  ColumnUniversalId,
  ColumnsCollectionDriver,
  ColumnsCollectionDriverHost,
  ColumnsDiscoverOptions,
  ColumnsFilterOptions,
  DiscoverColumnsOptions,
  DiscoverColumnsResponse,
  DiscoverColumnsStepInfo,
  MatchQualifications,
  NativePObjectId,
  PColumnSpec,
  PFrameSpecDriver,
  PObjectId,
  PoolEntry,
  SerializedColumnsSource,
  SpecFrameHandle,
  SpecOverrides,
} from "@milaboratories/pl-model-common";
import {
  AccessorEntriesProvider,
  ResultPoolEntriesProvider,
  convertColumnSelectorToMultiColumnSelector,
  createGlobalPObjectId,
  createColumnOverridedId,
  dedupColumns,
  deriveNativeId,
  deriveSpecDelta,
  extractPObjectId,
  isPColumnSpec,
  isPlRef,
  isEmptySpecDelta,
  matchingModeToConstraints,
  reconstructSpecFromId,
  stringifyColumnDiscoveredId,
} from "@milaboratories/pl-model-common";
import { throwError } from "@milaboratories/helpers";
import { randomUUID } from "node:crypto";

/**
 * Single contribution to a collection's column set. Mirrors the shapes of
 * {@link SerializedColumnsSource} but keeps host-resolved references — the
 * driver never re-resolves an accessor handle after the initial deserialise.
 */
type SourceContribution<A extends AccessorLike<A>> =
  | { readonly type: "provider"; readonly provider: ColumnEntriesProvider<A> }
  | {
      readonly type: "ids";
      readonly ids: ReadonlyArray<ColumnUniversalId>;
      readonly isFinal: boolean;
    };

interface CollectionState<A extends AccessorLike<A>> {
  readonly contributions: ReadonlyArray<SourceContribution<A>>;
  refs: number;
}

/**
 * Host-side `ColumnsCollectionDriver` implementation. Owns all
 * collection state addressable by opaque {@link CollectionHandle} strings;
 * the sandbox/UI bridge only ever sees those handles.
 *
 * Generic over the host's concrete accessor flavour: middle-layer passes
 * `PlTreeNodeAccessor` from `@milaboratories/pl-tree`; UI-side instances
 * (which never invoke `{kind:"accessor"}` / `{kind:"result_pool"}` sources)
 * default to `AccessorLike<any>`.
 *
 * Handle lifecycle is plain refcount: every minting method returns a fresh
 * {@link PoolEntry} with `unref` and `Symbol.dispose`.
 */
export class ColumnsCollectionDriverImpl<A extends AccessorLike<A> = AccessorLike<any>>
  implements ColumnsCollectionDriver, AsyncDisposable
{
  private readonly registry = new Map<CollectionHandle, CollectionState<A>>();

  create(
    sources: ReadonlyArray<SerializedColumnsSource>,
    host: ColumnsCollectionDriverHost<A>,
  ): PoolEntry<CollectionHandle> {
    const contributions = sources.map((src) => this.materialiseSource(src, host));
    return this.mint(contributions);
  }

  isEmpty(handle: CollectionHandle): boolean {
    const state = this.requireState(handle);
    for (const c of state.contributions) {
      switch (c.type) {
        case "provider":
          if (c.provider.getPObjectEntries().size > 0) return false;
          break;
        case "ids":
          if (c.ids.length > 0) return false;
          break;
      }
    }
    return true;
  }

  isFinal(handle: CollectionHandle): boolean {
    const state = this.requireState(handle);
    for (const c of state.contributions) {
      switch (c.type) {
        case "provider":
          if (!c.provider.isFinal()) return false;
          break;
        case "ids":
          if (!c.isFinal) return false;
          break;
      }
    }
    return true;
  }

  /**
   * Returns the deduplicated id list for `handle`. Dedup semantics are
   * shared with sandbox-side `extractColumns` via {@link dedupColumns} —
   * the same physical column reached via outputs vs. result_pool collapses
   * to one (provider order decides which id is canonical).
   */
  getColumns(handle: CollectionHandle, host: ColumnsCollectionDriverHost<A>): ColumnUniversalId[] {
    const state = this.requireState(handle);
    const all = state.contributions.flatMap((c) => {
      switch (c.type) {
        case "provider":
          return Array.from(c.provider.getPObjectEntries().keys());
        case "ids":
          return [...c.ids];
      }
    });
    return dedupColumns(
      all,
      (id) => id,
      (id) => {
        const spec = host.resolveSpec(extractPObjectId(id));
        return spec === undefined ? undefined : reconstructSpecFromId(spec, id);
      },
    );
  }

  addSource(
    handle: CollectionHandle,
    sources: ReadonlyArray<SerializedColumnsSource>,
    host: ColumnsCollectionDriverHost<A>,
  ): PoolEntry<CollectionHandle> {
    const state = this.requireState(handle);
    const next = [
      ...state.contributions,
      ...sources.map((src) => this.materialiseSource(src, host)),
    ];
    return this.mint(next);
  }

  discover(
    handle: CollectionHandle,
    options: ColumnsDiscoverOptions,
    host: ColumnsCollectionDriverHost<A>,
  ): PoolEntry<CollectionHandle> {
    return this.runDiscovery(handle, options, host);
  }

  filter(
    handle: CollectionHandle,
    options: ColumnsFilterOptions,
    host: ColumnsCollectionDriverHost<A>,
  ): PoolEntry<CollectionHandle> {
    return this.runDiscovery(handle, options, host);
  }

  async dispose(): Promise<void> {
    this.registry.clear();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }

  /** Number of currently-held handles. Test-facing. */
  size(): number {
    return this.registry.size;
  }

  private materialiseSource(
    src: SerializedColumnsSource,
    host: ColumnsCollectionDriverHost<A>,
  ): SourceContribution<A> {
    switch (src.kind) {
      case "ids":
        return { type: "ids", ids: src.ids, isFinal: src.isFinal };

      case "collection":
        return {
          type: "ids",
          ids: this.getColumns(src.handle, host),
          isFinal: this.isFinal(src.handle),
        };

      case "accessor": {
        const accessor = host.resolveAccessor(src.accessor as AccessorHandle);
        return {
          type: "provider",
          provider: new AccessorEntriesProvider<A>(accessor, src.path),
        };
      }

      case "result_pool":
        return {
          type: "provider",
          provider: new ResultPoolEntriesProvider<A>(host.getUpstreamBlockCtxes()),
        };
    }
  }

  private mint(contributions: ReadonlyArray<SourceContribution<A>>): PoolEntry<CollectionHandle> {
    const key = randomUUID() as CollectionHandle;
    const state: CollectionState<A> = { contributions, refs: 1 };
    this.registry.set(key, state);

    let released = false;
    const unref = (): void => {
      if (released) return;
      released = true;
      state.refs--;
      if (state.refs <= 0) this.registry.delete(key);
    };

    return {
      key,
      resource: state as unknown as {},
      unref,
      [Symbol.dispose]: unref,
    };
  }

  private requireState(handle: CollectionHandle): CollectionState<A> {
    const state = this.registry.get(handle);
    if (state === undefined) {
      throw new Error(
        `ColumnsCollectionDriverImpl: unknown CollectionHandle "${handle}" (handle expired or never minted)`,
      );
    }
    return state;
  }

  private runDiscovery(
    handle: CollectionHandle,
    options: DiscoverColumnsOptions,
    host: ColumnsCollectionDriverHost<A>,
  ): PoolEntry<CollectionHandle> {
    const sourceIsFinal = this.isFinal(handle);
    const ids = this.getColumns(handle, host);
    if (ids.length === 0) {
      return this.mint([{ type: "ids", ids: [], isFinal: sourceIsFinal }]);
    }

    const specDriver = host.getSpecDriver();
    const specMap = new Map<ColumnUniversalId, PColumnSpec>();
    for (const id of ids) {
      const leaf = extractPObjectId(id);
      const spec = host.resolveSpec(leaf);
      if (spec === undefined) continue;
      specMap.set(id, reconstructSpecFromId(spec, id));
    }

    const anchors = options.anchors;
    const hasAnchors = anchors !== undefined && Object.keys(anchors).length > 0;
    const anchorsRec = hasAnchors ? resolveAnchors(anchors, specMap, specDriver) : undefined;
    const anchorsList = anchorsRec ? Object.values(anchorsRec) : [];

    // Anchors requested but none resolved yet — return empty, preserving finality (as zero-ids does).
    if (hasAnchors && anchorsList.length === 0) {
      return this.mint([{ type: "ids", ids: [], isFinal: sourceIsFinal }]);
    }

    using specFrame = specDriver.createSpecFrame(Object.fromEntries(specMap.entries()));

    const response = specDriver.discoverColumns(specFrame.key, {
      includeColumns: options.include
        ? convertColumnSelectorToMultiColumnSelector(options.include)
        : undefined,
      excludeColumns: options.exclude
        ? convertColumnSelectorToMultiColumnSelector(options.exclude)
        : undefined,
      constraints: matchingModeToConstraints(options.mode ?? "enrichment"),
      maxHops: options.maxHops ?? (hasAnchors ? 4 : 0),
      axes: anchorsList.map((anchorId) => {
        const spec =
          specMap.get(anchorId) ??
          throwError(`ColumnsCollectionDriverImpl: anchor "${anchorId}" lost from effective specs`);
        return { axesSpec: spec.axesSpec, qualifications: [] };
      }),
    });

    const resultIds = hasAnchors
      ? mapHitsWithDiscovery(response, specMap, anchorsList)
      : mapHitsDirect(response, specMap);

    return this.mint([{ type: "ids", ids: resultIds, isFinal: sourceIsFinal }]);
  }
}

function mapHitsDirect(
  response: DiscoverColumnsResponse,
  effectiveSpecs: ReadonlyMap<ColumnUniversalId, PColumnSpec>,
): ColumnUniversalId[] {
  const known = new Set(effectiveSpecs.keys());
  const out: ColumnUniversalId[] = [];
  for (const hit of response.hits) {
    const id = hit.hit.columnId;
    if (known.has(id)) out.push(id);
  }
  return out;
}

function mapHitsWithDiscovery(
  response: DiscoverColumnsResponse,
  specs: ReadonlyMap<ColumnUniversalId, PColumnSpec>,
  anchors: ColumnUniversalId[],
): ColumnUniversalId[] {
  const out: ColumnUniversalId[] = [];
  for (const hit of response.hits) {
    const originalId = hit.hit.columnId;
    const originalSpec =
      specs.get(originalId) ??
      throwError(
        `ColumnsCollectionDriverImpl: discover hit column "${originalId}" not found in collection`,
      );
    const hitDelta = deriveSpecDelta(originalSpec, hit.hit.spec);
    const baseId = isEmptySpecDelta(hitDelta) ? originalId : applyOverride(originalId, hitDelta);
    const path = hit.path.map((step) => buildLinkerStep(step, specs));

    for (const variant of hit.mappingVariants) {
      const quals = remapAnchorQualifications(variant.qualifications, anchors);
      out.push(
        path.length === 0 && quals === undefined ? baseId : applyDiscovery(baseId, path, quals),
      );
    }
  }
  return out;
}

function buildLinkerStep(
  step: DiscoverColumnsStepInfo,
  specs: ReadonlyMap<ColumnUniversalId, PColumnSpec>,
): { type: "linker"; column: ColumnUniversalId } {
  if (step.type !== "linker") {
    throw new Error(`Unexpected discover-columns step type: ${step.type}`);
  }
  const linkerOrigId = step.linker.columnId;
  const linkerSpec =
    specs.get(linkerOrigId) ??
    throwError(
      `ColumnsCollectionDriverImpl: linker column "${linkerOrigId}" not found in collection`,
    );
  const linkerDelta = deriveSpecDelta(linkerSpec, step.linker.spec);
  const linkerId = isEmptySpecDelta(linkerDelta)
    ? linkerOrigId
    : applyOverride(linkerOrigId, linkerDelta);
  return { type: "linker", column: linkerId };
}

function applyDiscovery(
  baseId: ColumnUniversalId,
  path?: ReadonlyArray<{ type: "linker"; column: ColumnUniversalId }>,
  quals?: MatchQualifications,
): ColumnUniversalId {
  return stringifyColumnDiscoveredId({
    column: baseId,
    path: path?.map((p) => ({ type: "linker", column: p.column })),
    columnQualifications: quals?.forHit,
    queriesQualifications: quals?.forQueries,
  });
}

function applyOverride(id: ColumnUniversalId, delta: SpecOverrides): ColumnUniversalId {
  return createColumnOverridedId({ source: id, specOverrides: delta });
}

function remapAnchorQualifications(
  qualifications: { forQueries: AxisQualification[][]; forHit: AxisQualification[] },
  anchors: ColumnUniversalId[],
): undefined | MatchQualifications {
  const forQueries: Record<PObjectId, AxisQualification[]> = {};
  let hasForQueries = false;
  qualifications.forQueries.forEach((qs, i) => {
    const anchor = anchors[i];
    if (anchor === undefined || qs.length === 0) return;
    forQueries[extractPObjectId(anchor)] = qs;
    hasForQueries = true;
  });
  return !hasForQueries && qualifications.forHit.length === 0
    ? undefined
    : {
        forQueries,
        forHit: qualifications.forHit,
      };
}

function resolveAnchors(
  anchors: Record<string, AnchorEntry>,
  specs: ReadonlyMap<ColumnUniversalId, PColumnSpec>,
  specDriver: PFrameSpecDriver,
): Record<string, ColumnUniversalId> {
  const result: Record<string, ColumnUniversalId> = {};
  const resolvedIds = new Set<ColumnUniversalId>();
  const duplicateError = (key: string) =>
    `Anchor "${key}": selector matched a column that was already matched by another anchor; please refine the selector to match a different column`;

  let specFrame: undefined | PoolEntry<SpecFrameHandle>;
  const discoverColumns: AnchorDiscover = (request) => {
    specFrame ??= specDriver.createSpecFrame(Object.fromEntries(specs.entries()));
    return specDriver.discoverColumns(specFrame.key, request);
  };

  // O(1) lookup map built lazily — only when a spec-based anchor is
  // encountered. Avoids O(anchors × columns) `deriveNativeId` calls.
  let byNativeId: Map<NativePObjectId, ColumnUniversalId> | undefined;
  const getByNativeId: AnchorNativeIdLookup = () => {
    if (byNativeId === undefined) {
      byNativeId = new Map();
      for (const [id, spec] of specs) byNativeId.set(deriveNativeId(spec), id);
    }
    return byNativeId;
  };

  try {
    for (const [name, anchor] of Object.entries(anchors)) {
      const found = matchAnchor(name, anchor, specs, discoverColumns, getByNativeId);
      if (found === undefined) continue;
      if (resolvedIds.has(found)) throwError(duplicateError(name));
      result[name] = found;
      resolvedIds.add(found);
    }
  } finally {
    specFrame?.unref();
  }

  // Zero resolved anchors is transient (anchors not published yet); runDiscovery handles it.
  return result;
}

type AnchorDiscover = (
  request: Parameters<PFrameSpecDriver["discoverColumns"]>[1],
) => DiscoverColumnsResponse;

type AnchorNativeIdLookup = () => ReadonlyMap<NativePObjectId, ColumnUniversalId>;

function matchAnchor(
  name: string,
  anchor: AnchorEntry,
  specs: ReadonlyMap<ColumnUniversalId, PColumnSpec>,
  discoverColumns: AnchorDiscover,
  getByNativeId: AnchorNativeIdLookup,
): undefined | ColumnUniversalId {
  if (isPlRef(anchor)) {
    const id = createGlobalPObjectId(anchor.blockId, anchor.name);
    return findById(specs, id);
  }
  if (typeof anchor === "string") {
    const id = anchor;
    return findById(specs, id);
  }
  if ("kind" in anchor) {
    if (!isPColumnSpec(anchor)) throwError(`Anchor "${name}": invalid PColumnSpec`);
    return getByNativeId().get(deriveNativeId(anchor));
  }

  // RelaxedColumnSelector
  const matched = discoverColumns({
    includeColumns: convertColumnSelectorToMultiColumnSelector(anchor),
    excludeColumns: undefined,
    axes: [],
    maxHops: 0,
    constraints: matchingModeToConstraints("exact"),
  });
  if (matched.hits.length === 0) return undefined;
  if (matched.hits.length > 1) {
    throwError(
      `Anchor "${name}": selector is ambiguous and matched multiple columns; please refine the selector to match exactly one column`,
    );
  }
  return matched.hits[0].hit.columnId;
}

function findById(
  specs: ReadonlyMap<ColumnUniversalId, PColumnSpec>,
  needle: ColumnUniversalId,
): ColumnUniversalId | undefined {
  return specs.has(needle) ? needle : undefined;
}
