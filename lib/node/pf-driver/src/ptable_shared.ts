import type {
  DataQuery,
  JsonDataInfo,
  PFrameHandle,
  PObjectId,
  PTableColumnSpec,
  PTableDef,
  PTableHandle,
  SpecQuery,
} from "@milaboratories/pl-model-common";
import { traverseQuerySpec } from "@milaboratories/pl-model-common";
import { hashJson, PFrameInternal } from "@milaboratories/pl-model-middle-layer";

/**
 * Make every inline column in a `SpecQuery` self-contained by embedding its
 * column `typeSpec` (`{ axes, column }`) into `dataInfo`, derived from the
 * column's `PColumnSpec`.
 */
export function embedInlineColumnTypeSpecs(query: SpecQuery): SpecQuery {
  return traverseQuerySpec(query, {
    column: (c) => c,
    node: (node) => {
      if (node.type !== "inlineColumn") return node;
      const { axesSpec, valueType } = node.spec.spec;
      const dataInfo: JsonDataInfo & { typeSpec: PFrameInternal.PColumnValueTypeSpec } = {
        ...node.dataInfo,
        typeSpec: { axes: axesSpec.map((a) => a.type), column: valueType },
      };
      return { ...node, dataInfo };
    },
  });
}

/**
 * PTable definition stored in the def / table pools. Always
 * carries a pre-lowered data query plus the corresponding output
 * `tableSpec`. Legacy `PTableDef<PObjectId>` inputs are lowered to
 * this shape via WASM-spec at acquire time.
 */
export type FullPTableDef = {
  pFrameHandle: PFrameHandle;
  tableSpec: PTableColumnSpec[];
  dataQuery: DataQuery;
};

export function stableKeyFromFullPTableDef(data: FullPTableDef): PTableHandle {
  return hashJson(data) as string as PTableHandle;
}

/**
 * Lower a legacy `PTableDef<PObjectId>` to the data layer. Returns
 * the output `tableSpec` and the lowered `dataQuery`. Routes through
 * `rewriteLegacyQuery` + `evaluateQuery` on the caller-supplied
 * WASM-spec frame.
 */
export function lowerLegacyPTableDef(
  pFrameSpec: PFrameInternal.PFrameWasmV3,
  legacyDef: PTableDef<PObjectId>,
): { tableSpec: PTableColumnSpec[]; dataQuery: DataQuery } {
  const legacy: PFrameInternal.LegacyQuery = {
    src: legacyDef.src,
    filters: [...legacyDef.partitionFilters, ...legacyDef.filters],
    sorting: legacyDef.sorting,
  };
  return pFrameSpec.evaluateQuery(
    embedInlineColumnTypeSpecs(pFrameSpec.rewriteLegacyQuery(legacy)),
  );
}

/**
 * Build a `FullPTableDef` from a legacy `PTableDef` plus the
 * PFrame's WASM-spec frame. Used by pool `acquireFromLegacy` methods
 * to keep lowering off the call site.
 */
export function buildFullPTableDefFromLegacy(opts: {
  pFrameHandle: PFrameHandle;
  def: PTableDef<PObjectId>;
  pFrameSpec: PFrameInternal.PFrameWasmV3;
}): FullPTableDef {
  return {
    pFrameHandle: opts.pFrameHandle,
    ...lowerLegacyPTableDef(opts.pFrameSpec, opts.def),
  };
}
