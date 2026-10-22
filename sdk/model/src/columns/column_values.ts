import {
  createColumnValueId,
  type ColumnUniversalId,
  type ColumnValueId,
  type PFrameHandle,
} from "@milaboratories/pl-model-common";
import type { RenderCtxBase } from "../render";
import type { GlobalCfgRenderCtx } from "../render/internal";
import { ColumnRecipe } from "./column_recipes";

/** Drop-down option for a value of a column — column-value-id valued. */
export type ColumnValueOption = {
  readonly value: ColumnValueId;
  readonly label: string;
};

/**
 * Where a UI reads the values of a picked column from: a frame holding that column alone, while
 * the column is there. `column` is the pick the source was made for, so the UI can tell a source
 * that still describes an earlier pick.
 */
export type ColumnValuesSource =
  | { readonly type: "resolving"; readonly column: ColumnUniversalId }
  | { readonly type: "absent"; readonly column: ColumnUniversalId }
  | { readonly type: "present"; readonly column: ColumnUniversalId; readonly frame: PFrameHandle };

/** What `createColumnValuesSource` needs of a render ctx; any `RenderCtxBase` is one. */
export type ColumnValuesCtx = Pick<RenderCtxBase, "createPFrame"> & {
  /** The render ctx the column is resolved in; the global one when not given. */
  readonly ctx?: GlobalCfgRenderCtx;
};

/**
 * The source a UI reads the values of `column` from, for a model output. The values are read in
 * the UI, through the frame, so a column of any storage format can be picked from. `absent` once
 * the column is gone: a stored id may name a column its upstream block no longer produces.
 */
export function createColumnValuesSource(
  ctx: ColumnValuesCtx,
  column: ColumnUniversalId,
): ColumnValuesSource {
  const status = ColumnRecipe.getStatus(column, { ctx: ctx.ctx });
  if (status !== "present") return { type: status, column };
  const frame = ctx.createPFrame([column]);
  return frame === undefined ? { type: "resolving", column } : { type: "present", column, frame };
}

/**
 * Distinct `values` of `column` as options, each a column value id naming the column, labelled
 * by the value itself and ordered naturally by label ("R2" before "R10"). Empty values are not
 * offered.
 */
export function deriveColumnValueOptions(
  column: ColumnUniversalId,
  values: readonly string[],
): ColumnValueOption[] {
  const options = new Map<string, ColumnValueOption>();
  for (const value of values) {
    if (value === "" || options.has(value)) continue;
    options.set(value, { value: createColumnValueId({ column, value }), label: value });
  }
  return [...options.values()].sort((a, b) => compareNatural(a.label, b.label));
}

// Internals

const CHUNKS = /\d+|\D+/g;

/**
 * Natural order: runs of digits compare as numbers, other text case-insensitively, so "R2"
 * comes before "R10". The model runtime has no `Intl`.
 */
function compareNatural(a: string, b: string): number {
  const chunksA = a.match(CHUNKS) ?? [];
  const chunksB = b.match(CHUNKS) ?? [];
  for (let i = 0; i < Math.min(chunksA.length, chunksB.length); i++) {
    const order = compareChunks(chunksA[i], chunksB[i]);
    if (order !== 0) return order;
  }
  return chunksA.length - chunksB.length || compareStrings(a, b);
}

function compareChunks(a: string, b: string): number {
  if (isDigits(a) && isDigits(b)) {
    // Compared as digit strings, so numbers of any length keep their order.
    const numberA = a.replace(/^0+(?=\d)/, "");
    const numberB = b.replace(/^0+(?=\d)/, "");
    return numberA.length - numberB.length || compareStrings(numberA, numberB);
  }
  return compareStrings(a.toLowerCase(), b.toLowerCase());
}

function isDigits(chunk: string): boolean {
  return chunk.charCodeAt(0) >= 48 && chunk.charCodeAt(0) <= 57;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
