import type {
  CollectionHandle,
  ColumnUniversalId,
  ColumnsCollectionDriverModel,
  ColumnsDiscoverOptions,
  ColumnsFilterOptions,
  SerializedColumnsSource,
} from "@milaboratories/pl-model-common";
import type { GlobalCfgRenderCtx } from "../render/internal";
import { MainAccessorName, StagingAccessorName } from "../render/internal";
import type { ColumnsSource } from "./column_providers";
import { isColumnProvider } from "./column_providers";
import { TreeNodeAccessor } from "../render/accessor";
import { getService } from "../services/get_services";
import { getCfgRenderCtx } from "../internal";
import { ColumnRecipe } from "./column_recipes";
import { isNil } from "es-toolkit";

export interface ColumnsCollectionDeps {
  /** Render ctx used both for service resolution and for default ctx sources. */
  readonly ctx?: GlobalCfgRenderCtx;
  /** Override the resolved `columnsCollection` service — primarily for tests. */
  readonly driver?: ColumnsCollectionDriverModel;
}

/**
 * Shorthand literals accepted inside `ColumnsCollection`'s `sources`
 * array, expanded against the active render ctx:
 *
 * - `"result_pool"`  – fan-out into the host's upstream-block result pool.
 * - `"current_block"` – main outputs + prerun (staging) accessors of the
 *   current block, when present.
 */
export type ColumnsSourceShorthand = "result_pool" | "current_block";

/**
 * Build a {@link ColumnsCollection} from sandbox-side source descriptors.
 * Resolves the `columnsCollection` driver (either from `deps.driver` or via
 * `getService("columnsCollection")`) and asks the host to mint a fresh
 * handle covering the supplied sources. Pass `sources === undefined` to
 * fall back to the active render ctx (main outputs + prerun + result pool).
 *
 * `sources` accepts {@link ColumnsSourceShorthand} string literals
 * (`"result_pool"`, `"current_block"`) for the common ctx-derived sources.
 */
export function ColumnsCollection(
  sources?: (ColumnsCollection | ColumnsSource | ColumnsSourceShorthand)[],
  deps?: ColumnsCollectionDeps,
): ColumnsCollection {
  const driver = deps?.driver ?? getService("columnsCollection", { ctx: deps?.ctx });
  const serialized: SerializedColumnsSource[] = sources
    ? sources.flatMap((s) => toSerializedSources(s, deps?.ctx))
    : defaultCtxSources(deps?.ctx);
  return new ColumnsCollectionImpl(driver.create(serialized), driver);
}

export function isColumnsCollection(value: unknown): value is ColumnsCollection {
  return value instanceof ColumnsCollectionImpl;
}

/**
 * Sandbox proxy over the host-side `ColumnsCollection` driver. The driver
 * owns all column-set state; this object only carries an opaque
 * {@link CollectionHandle} plus a reference to the driver service.
 *
 * Construct via {@link ColumnsCollection} — the bare constructor is a
 * trivial `(handle, driver)` pair so that `addSource` / `discover` / `filter`
 * can rebind a freshly-minted handle without going through source
 * serialisation again.
 *
 * Every method returning a `ColumnsCollection` mints a fresh handle on the
 * host — the host VM bridge pins it to the active render ctx, so the sandbox
 * never has to manage refcounts.
 */
export class ColumnsCollectionImpl {
  constructor(
    public readonly handle: CollectionHandle,
    private readonly driver: ColumnsCollectionDriverModel,
  ) {}

  isEmpty(): boolean {
    return this.driver.isEmpty(this.handle);
  }

  isFinal(): boolean {
    return this.driver.isFinal(this.handle);
  }

  getColumnIds(): ColumnUniversalId[] {
    return this.driver.getColumns(this.handle);
  }

  getColumns(): ColumnRecipe[] {
    return this.getColumnIds()
      .map((id) => ColumnRecipe(id))
      .filter((c): c is ColumnRecipe => !isNil(c));
  }

  addSource(source: ColumnsSource | ColumnsCollection): ColumnsCollection {
    return new ColumnsCollectionImpl(
      this.driver.addSource(this.handle, toSerializedSources(source)),
      this.driver,
    );
  }

  discover(options: ColumnsDiscoverOptions): ColumnsCollection {
    return new ColumnsCollectionImpl(this.driver.discover(this.handle, options), this.driver);
  }

  filter(options: ColumnsFilterOptions): ColumnsCollection {
    return new ColumnsCollectionImpl(this.driver.filter(this.handle, options), this.driver);
  }
}

/** Public type alias — value of the same name is the factory function above. */
export type ColumnsCollection = ColumnsCollectionImpl;

function toSerializedSources(
  source: ColumnsCollection | ColumnsSource | ColumnsSourceShorthand,
  ctx?: GlobalCfgRenderCtx,
): SerializedColumnsSource[] {
  if (source === "result_pool") {
    return [{ kind: "result_pool" }];
  }
  if (source === "current_block") {
    return currentBlockSources(ctx);
  }
  if (source instanceof ColumnsCollectionImpl) {
    return [{ kind: "collection", handle: source.handle }];
  }
  if (source instanceof TreeNodeAccessor) {
    return [{ kind: "accessor", accessor: source.handle, path: source.resolvePath }];
  }
  if (isColumnArray(source)) {
    return [{ kind: "ids", ids: source.columns.map((c) => c.id), isFinal: source.isFinal }];
  }
  if (isColumnProvider(source)) {
    return [{ kind: "ids", ids: source.getColumns().map((c) => c.id), isFinal: source.isFinal() }];
  }
  throw new Error("ColumnsCollection: unrecognised ColumnsSource shape");
}

function isColumnArray(source: unknown): source is {
  columns: ReadonlyArray<{ id: ColumnUniversalId; spec?: unknown; data?: unknown }>;
  isFinal: boolean;
} {
  if (typeof source !== "object" || source === null) return false;
  const s = source as { columns?: unknown; isFinal?: unknown };
  return Array.isArray(s.columns) && typeof s.isFinal === "boolean";
}

function currentBlockSources(ctx?: GlobalCfgRenderCtx): SerializedColumnsSource[] {
  const renderCtx = ctx ?? getCfgRenderCtx();
  const sources: SerializedColumnsSource[] = [];

  const outputs = renderCtx.getAccessorHandleByName(MainAccessorName);
  if (outputs !== undefined) {
    sources.push({ kind: "accessor", accessor: outputs, path: [MainAccessorName] });
  }
  const prerun = renderCtx.getAccessorHandleByName(StagingAccessorName);
  if (prerun !== undefined) {
    sources.push({ kind: "accessor", accessor: prerun, path: [StagingAccessorName] });
  }

  return sources;
}

function defaultCtxSources(ctx?: GlobalCfgRenderCtx): SerializedColumnsSource[] {
  return [...currentBlockSources(ctx), { kind: "result_pool" }];
}
