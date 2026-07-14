import type { PlTreeNodeAccessor } from "@milaboratories/pl-tree";
import {
  AccessorEntriesProvider,
  applySpecOverrides,
  ColumnRegistry,
  extractPObjectId,
  PColumnValues,
  ResultPoolEntriesProvider,
  SpecOverrides,
  type ColumnEntriesProvider,
  type PColumn,
  type PColumnSpec,
  type PObjectId,
  type UpstreamBlockCtx,
} from "@milaboratories/pl-model-common";

export interface ColumnRegistryRoots {
  /** Main `outputs` accessor (if available) — usually `MainAccessorName`. */
  readonly outputs?: PlTreeNodeAccessor;
  /** Prerun `staging` accessor (if available) — usually `StagingAccessorName`. */
  readonly prerun?: PlTreeNodeAccessor;
  /** Upstream-block ctx accessors (as `collectUpstreamBlockCtxes` returns). */
  readonly upstreamBlockCtxes: ReadonlyArray<UpstreamBlockCtx<PlTreeNodeAccessor>>;
}

/**
 * Build a host-side {@link ColumnRegistry} mirroring the sandbox layout:
 * `outputs` precedes `prerun` precedes `rawResultPool`, first-wins on conflict.
 *
 * Uses raw {@link PlTreeNodeAccessor}s directly — both `TreeNodeAccessor`
 * (sandbox) and `PlTreeNodeAccessor` (host) satisfy the `AccessorLike`
 * traversal surface, so no host-side adapter is required.
 */
export function buildColumnRegistry(
  roots: ColumnRegistryRoots,
): ColumnRegistry<PlTreeNodeAccessor> {
  const providers: ColumnEntriesProvider<PlTreeNodeAccessor>[] = [];

  if (roots.outputs !== undefined) {
    providers.push(new AccessorEntriesProvider(roots.outputs, ["main"]));
  }
  if (roots.prerun !== undefined) {
    providers.push(new AccessorEntriesProvider(roots.prerun, ["staging"]));
  }

  providers.push(new ResultPoolEntriesProvider<PlTreeNodeAccessor>(roots.upstreamBlockCtxes));

  return new ColumnRegistry<PlTreeNodeAccessor>(providers);
}

/**
 * Resolve a column id to a materialised {@link PColumn} backed by the
 * underlying {@link PlTreeNodeAccessor} for the `.data` resource. Returns the
 * bare leaf spec (via {@link extractPObjectId}): filters / overrides encoded in
 * a rich id are NOT reconstructed here — they are applied by the query nodes
 * (`sliceAxes` / `specOverride`) that wrap this leaf in the def, so reconstructing
 * would double-apply them. Only the explicit `overrides` argument is folded in.
 *
 * Throws when the id is not in the registry or the column has no resolved spec.
 * A `.data` field that has not yet materialised yields an empty value list — the
 * column refills on a later recomputation, mirroring the sandbox-side
 * `finalizePColumnData` behaviour rather than blocking the whole PFrame.
 */
export function resolvePColumnById(
  registry: ColumnRegistry<PlTreeNodeAccessor>,
  id: PObjectId,
  overrides?: SpecOverrides,
): PColumn<PColumnValues | PlTreeNodeAccessor> {
  const pid = extractPObjectId(id);
  const leaf = registry.resolve(pid);
  if (leaf === undefined) {
    throw new Error(`column id ${String(pid)} not found in host column registry`);
  }
  const specNode = leaf.accessor.traverse({
    field: `${leaf.name}.spec`,
    assertFieldType: "Input",
    ignoreError: true,
  });
  const spec = specNode?.getDataAsJson<PColumnSpec>();
  if (spec === undefined) {
    throw new Error(`column ${String(pid)} has no resolved spec`);
  }
  const data =
    leaf.accessor.traverse({
      field: `${leaf.name}.data`,
      assertFieldType: "Input",
      ignoreError: true,
    }) ?? [];

  return {
    id: id as PObjectId,
    spec: applySpecOverrides(spec, overrides),
    data,
  };
}
