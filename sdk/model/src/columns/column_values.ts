import {
  createColumnValueId,
  extractPObjectId,
  isPColumn,
  type ColumnUniversalId,
  type ColumnValueId,
  type PColumn,
  type PFrameHandle,
  type PObjectId,
} from "@milaboratories/pl-model-common";
import { finalizePColumnData } from "../render/api";
import type { GlobalCfgRenderCtx, PColumnDataUniversal } from "../render/internal";
import { getCfgRenderCtx } from "../internal";
import { ColumnRecipe } from "./column_recipes";
import type { ColumnResolutionStatus } from "./column_recipes/types";
import type { DataColumnRecipe } from "./data_column";

/** Drop-down option for a value of a column — column-value-id valued. */
export type ColumnValueOption = {
  readonly value: ColumnValueId;
  readonly label: string;
};

/** A column a value picker offers the values of, or labels them by. */
export type ColumnValueOptionsColumn =
  | ColumnUniversalId
  | PColumn<undefined | PColumnDataUniversal>
  | DataColumnRecipe
  | ColumnRecipe;

/**
 * What a UI reads the options of a value picker from: a frame holding the value column, and the
 * label column while there is one, as long as the value column is there. `valueColumn` is the
 * column the options are values of, so the UI can tell a model that still describes an earlier
 * pick. `frameColumns` names both columns as the frame holds them.
 */
export type ColumnValueOptionsModel =
  | { readonly type: "resolving"; readonly valueColumn: ColumnUniversalId }
  | { readonly type: "absent"; readonly valueColumn: ColumnUniversalId }
  | {
      readonly type: "present";
      readonly valueColumn: ColumnUniversalId;
      readonly frame: PFrameHandle;
      readonly frameColumns: {
        readonly value: PObjectId;
        /** `null` when the values label themselves. */
        readonly label: PObjectId | null;
      };
    };

/**
 * The model of a value picker over the values of `valueColumn`, for a model output; the UI reads
 * the options through it (`usePlColumnValueOptions`, `PlColumnValueDropdown`). Each option is a
 * value of `valueColumn`, labelled by the value of `labelColumn` in the same row, or by the value
 * itself when no label column is given.
 *
 * `absent` once the value column is gone: a stored id may name a column its upstream block no
 * longer produces. A label column that is gone leaves the values to label themselves; one that is
 * still resolving keeps the model resolving.
 */
export function createColumnValueOptions(
  columns: {
    readonly valueColumn: ColumnValueOptionsColumn;
    readonly labelColumn?: ColumnValueOptionsColumn;
  },
  deps?: { readonly ctx?: GlobalCfgRenderCtx },
): ColumnValueOptionsModel {
  const ctx = deps?.ctx ?? getCfgRenderCtx();
  const value = frameEntryOf(columns.valueColumn, ctx);
  const valueColumn = value.id;
  if (value.status !== "present") return { type: value.status, valueColumn };

  const label =
    columns.labelColumn === undefined ? undefined : frameEntryOf(columns.labelColumn, ctx);
  if (label?.status === "resolving") return { type: "resolving", valueColumn };
  const labelled =
    label?.status === "present" && label.frameId !== value.frameId ? label : undefined;

  const frame = ctx.createPFrame(labelled === undefined ? [value.def] : [value.def, labelled.def]);
  return {
    type: "present",
    valueColumn,
    frame,
    frameColumns: { value: value.frameId, label: labelled?.frameId ?? null },
  };
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
  return deriveLabelledColumnValueOptions(
    column,
    values.map((value) => ({ value, label: value })),
  );
}

/**
 * Distinct values of `column` among `rows` as options, each a column value id naming the column,
 * labelled by the label of the first row holding the value, and ordered naturally by label ("R2"
 * before "R10"). Empty values are not offered; a value whose label is empty labels itself.
 */
export function deriveLabelledColumnValueOptions(
  column: ColumnUniversalId,
  rows: readonly { readonly value: string; readonly label: string }[],
): ColumnValueOption[] {
  const options = new Map<string, ColumnValueOption>();
  for (const { value, label } of rows) {
    if (value === "" || options.has(value)) continue;
    options.set(value, {
      value: createColumnValueId({ column, value }),
      label: label === "" ? value : label,
    });
  }
  return [...options.values()].sort((a, b) => compareNatural(a.label, b.label));
}

// Internals

/** A column as a frame is made of it: its id, its status, and what the frame is created from. */
type FrameEntry = {
  readonly id: ColumnUniversalId;
  readonly status: ColumnResolutionStatus;
  readonly frameId: PObjectId;
  readonly def: Parameters<GlobalCfgRenderCtx["createPFrame"]>[0][number];
};

/**
 * A column given by id or by a recipe goes into the frame by its id, which the frame holds as the
 * bare id of its leaf; a materialised column goes in as it is.
 */
function frameEntryOf(column: ColumnValueOptionsColumn, ctx: GlobalCfgRenderCtx): FrameEntry {
  if (typeof column === "string") {
    return {
      id: column,
      status: ColumnRecipe.getStatus(column, { ctx }),
      frameId: extractPObjectId(column),
      def: column,
    };
  }
  if (isPColumn<undefined | PColumnDataUniversal>(column)) {
    return {
      id: column.id,
      status: "present",
      frameId: column.id,
      def: finalizePColumnData(column),
    };
  }
  return {
    id: column.id,
    status: column.getDataStatus(),
    frameId: extractPObjectId(column.id),
    def: column.id,
  };
}

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
