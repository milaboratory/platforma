/**
 * Test-only: plant a stub provider into `_ctxProvidersCache` so that
 * `ColumnRegistry.resolve(id)` returns a `LeafEntry` whose spec accessor
 * reports `hasData() === true` and `getDataAsJson()` returns the supplied
 * spec. Sufficient for code that goes through
 * `getCtxProviders` / `readLeafSpecAccessor` (e.g. `DataColumnRecipe.fromId`,
 * `ColumnDiscoveredRecipe.fromKey`).
 *
 * Two leaf shapes:
 *  - `PColumnSpec` (shorthand) — spec present, accessor locked, `hasData`
 *    true. Discriminated at runtime by the presence of a `kind` field.
 *  - {@link StubLeafConfig} — fine-grained control: omit `spec` to simulate
 *    "no spec field reachable from this leaf"; set `accessorLocked: false`
 *    to simulate a still-resolving leaf accessor; set `specHasData: false`
 *    to simulate "spec resource exists but bytes not yet written".
 *
 * Registry-wide `isFinal` is also configurable — pass `{ isFinal: false }`
 * to simulate a still-enumerating registry where missing ids should report
 * `resolving` rather than `absent`.
 */
import type {
  ColumnEntriesProvider,
  LeafEntry,
  PColumnSpec,
  PObjectId,
  PObjectSpec,
} from "@milaboratories/pl-model-common";
import type { GlobalCfgRenderCtx } from "../../render/internal";
import type { TreeNodeAccessor } from "../../render/accessor";
import { _ctxProvidersCache } from "../column_providers";
import type { ColumnsProvider } from "../column_providers";
import { DataColumn } from "../data_column";

/** Fine-grained per-leaf stub config. Defaults match the shorthand form. */
export type StubLeafConfig = {
  /** Spec returned by `${id}.spec` traverse. Omit to simulate a missing field. */
  spec?: PObjectSpec;
  /** Drives `leaf.accessor.getInputsLocked()`. Default `true`. */
  accessorLocked?: boolean;
  /** Drives `spec.hasData()` (ignored when `spec` is omitted). Default `true`. */
  specHasData?: boolean;
};

/** Either the shorthand `PColumnSpec` or a {@link StubLeafConfig}. */
export type StubLeafInput = PColumnSpec | StubLeafConfig;

export function installStubRegistry(
  ctx: GlobalCfgRenderCtx,
  leaves: ReadonlyMap<PObjectId, StubLeafInput> | Record<PObjectId, StubLeafInput>,
  { isFinal = true }: { isFinal?: boolean } = {},
): void {
  const map =
    leaves instanceof Map
      ? leaves
      : new Map(Object.entries(leaves) as [PObjectId, StubLeafInput][]);
  _ctxProvidersCache.set(ctx, [buildStubProvider(map, isFinal)]);
}

function buildStubProvider(
  leaves: ReadonlyMap<PObjectId, StubLeafInput>,
  isFinal: boolean,
): ColumnEntriesProvider<TreeNodeAccessor> & ColumnsProvider {
  const entries = new Map<PObjectId, LeafEntry<TreeNodeAccessor>>(
    [...leaves].map(([id, raw]) => [
      id,
      { accessor: stubAccessorFor(id, normalizeLeafInput(raw)), name: id, id },
    ]),
  );
  return {
    getPObjectEntries: () => entries,
    isFinal: () => isFinal,
    getColumns: () =>
      Array.from(entries.values())
        .map((entry) => DataColumn.fromAccessor(entry))
        .filter((column) => column !== undefined),
  };
}

type NormalizedLeafConfig = {
  spec?: PObjectSpec;
  accessorLocked: boolean;
  specHasData: boolean;
};

function normalizeLeafInput(raw: StubLeafInput): NormalizedLeafConfig {
  if ("kind" in raw) {
    return { spec: raw, accessorLocked: true, specHasData: true };
  }
  return {
    spec: raw.spec,
    accessorLocked: raw.accessorLocked ?? true,
    specHasData: raw.specHasData ?? true,
  };
}

let stubAccessorSeq = 0;

function stubAccessorFor(id: PObjectId, cfg: NormalizedLeafConfig): TreeNodeAccessor {
  const specField = `${id}.spec`;
  const specHolder =
    cfg.spec === undefined
      ? undefined
      : {
          getDataAsJson: <T>() => cfg.spec as unknown as T,
          hasData: () => cfg.specHasData,
        };
  // Per-installation unique handle. The module-level `memoizeByEntry` LRU
  // caches key by `${accessor.handle}:${name}`, and reinstalling the stub
  // for the same id should produce a fresh cache lookup (otherwise tests
  // that vary leaf state for the same id see stale spec accessors).
  const handle = `${id}#${++stubAccessorSeq}`;
  const stub = {
    handle,
    resolvePath: [],
    traverse: (step: { field?: string } | string) => {
      const field = typeof step === "string" ? step : step?.field;
      return field === specField ? specHolder : undefined;
    },
    getDataAsJson: <T>() => cfg.spec as unknown as T,
    listInputFields: () => (cfg.spec !== undefined ? [specField] : []),
    getInputsLocked: () => cfg.accessorLocked,
  };
  return stub as unknown as TreeNodeAccessor;
}
