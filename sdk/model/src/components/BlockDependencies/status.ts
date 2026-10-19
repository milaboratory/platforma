import {
  Annotation,
  columnProducer,
  readAnnotationJson,
  type ColumnReference,
  type ColumnUniversalId,
  type ColumnValue,
  type PColumnSpec,
  type UpstreamBlockCtx,
} from "@milaboratories/pl-model-common";
import { isPlainObject, isString } from "es-toolkit";
import type { DependencyStatus, DependentStatus, UncheckedReason } from "./types";

/** What the last run of a block exports under one output name. */
export type ExportLookup =
  | { type: "unavailable" }
  | { type: "pending" }
  | { type: "present"; columnLabel: null | string; readValues: () => ExportValues };

/** Cell values of an exported column, as far as they can be read. */
export type ExportValues =
  | { type: "known"; cells: readonly unknown[] }
  | { type: "pending" }
  | { type: "unreadable" };

/**
 * How a reference fares against the export it points at. The same outcome reads differently for
 * the block holding the reference and for the block exporting the column.
 */
export type ExportCheck =
  | { type: "ok" }
  | { type: "pending" }
  | { type: "unchecked"; reason: UncheckedReason }
  | { type: "unavailable" }
  | { type: "missingValues"; values: ColumnValue[] };

/** A column another block exports, referenced from args, with the values picked from it. */
export interface OutgoingReference {
  producerBlockId: string;
  output: string;
  ref: ColumnUniversalId;
  values: null | ColumnValue[];
}

/** Args a block's references are read from, and where they come from. */
export type ChosenArgs = { source: "current" | "lastRun"; args: unknown } | { source: "none" };

/**
 * A block's current args, else the args of its last run; the last run's are read only when the
 * block has no current args.
 */
export function chooseArgs(reads: { current: () => unknown; lastRun: () => unknown }): ChosenArgs {
  const current = reads.current();
  if (current !== undefined) return { source: "current", args: current };
  const lastRun = reads.lastRun();
  if (lastRun !== undefined) return { source: "lastRun", args: lastRun };
  return { source: "none" };
}

/**
 * Every column of another block among `references`, in their order. A column local to the
 * block, or one whose id names no producer, is not a reference to another block and is skipped.
 */
export function collectOutgoingReferences(
  references: readonly ColumnReference[],
): OutgoingReference[] {
  const outgoing: OutgoingReference[] = [];
  for (const { ref, values } of references) {
    const producer = columnProducer(ref);
    if (producer === undefined) continue;
    outgoing.push({ producerBlockId: producer.blockId, output: producer.name, ref, values });
  }
  return outgoing;
}

/**
 * Whether a block's last run has listed everything it exports. A block that never ran exports
 * nothing and never will without a new run; a block whose run results are still being rendered,
 * or whose result list is still open, may export more.
 */
export function isProducerFinal<A>(
  producer: UpstreamBlockCtx<A>,
  inputsLocked: (ctx: A) => boolean,
): boolean {
  if (producer.prodIncomplete) return false;
  return producer.prodCtx === undefined || inputsLocked(producer.prodCtx);
}

/**
 * Checks `picked` values against the export `lookup` finds. `null` picks the column as a whole,
 * so only the export's presence matters. Any error while looking up or reading leaves the
 * reference `unchecked` as `unreadable`: one unreadable column does not hide the state of the
 * others.
 */
export function checkExport(
  lookup: () => ExportLookup,
  picked: null | readonly ColumnValue[],
): { check: ExportCheck; columnLabel: null | string } {
  let columnLabel: null | string = null;
  try {
    const found = lookup();
    if (found.type === "unavailable") return { check: { type: "unavailable" }, columnLabel };
    if (found.type === "pending") return { check: { type: "pending" }, columnLabel };
    columnLabel = found.columnLabel;
    if (picked === null) return { check: { type: "ok" }, columnLabel };

    const values = found.readValues();
    if (values.type === "pending") return { check: { type: "pending" }, columnLabel };
    if (values.type === "unreadable") {
      return { check: { type: "unchecked", reason: "unreadable" }, columnLabel };
    }

    const missing = missingValues(picked, values.cells);
    if (missing.length === 0) return { check: { type: "ok" }, columnLabel };
    return { check: { type: "missingValues", values: missing }, columnLabel };
  } catch {
    return { check: { type: "unchecked", reason: "unreadable" }, columnLabel };
  }
}

/** A reference this block holds: a column its producer does not export is broken. */
export function dependencyStatus(check: ExportCheck): DependencyStatus {
  switch (check.type) {
    case "unavailable":
      return { type: "broken", reason: "unavailable" };
    case "missingValues":
      return { type: "broken", reason: "missingValues", values: check.values };
    case "unchecked":
      return { type: "unchecked", reason: check.reason };
    case "ok":
    case "pending":
      return { type: check.type };
  }
}

/**
 * A reference to this block's output: an output this block does not export breaks the block
 * holding the reference.
 */
export function dependentStatus(check: ExportCheck): DependentStatus {
  switch (check.type) {
    case "unavailable":
      return { type: "broken", reason: "notExported" };
    case "missingValues":
      return { type: "missingValues", values: check.values };
    case "unchecked":
      return { type: "unchecked", reason: check.reason };
    case "ok":
    case "pending":
      return { type: check.type };
  }
}

/**
 * Picked values the cells do not hold, in picked order. A number and its decimal string are the
 * same value: one block stores a column's raw numbers while another picks them as strings. Null
 * cells, and cells other than strings and finite numbers, hold no value that can be picked.
 */
export function missingValues(
  picked: readonly ColumnValue[],
  cells: readonly unknown[],
): ColumnValue[] {
  const present = new Set<string>();
  for (const cell of cells) {
    const key = valueKey(cell);
    if (key !== undefined) present.add(key);
  }
  return picked.filter((value) => {
    const key = valueKey(value);
    return key === undefined || !present.has(key);
  });
}

/** The data node surface {@link readExportValues} reads. */
export interface JsonDataNode {
  readonly resourceType: { readonly name: string };
  /** `undefined` while the resource is not ready; throws when it failed. */
  getDataAsJsonOrUndefined(): unknown;
}

/**
 * Cell values of an exported column. The `pl7.app/discreteValues` annotation, when the spec has
 * it, lists them without touching the data. Otherwise only data stored inline as JSON
 * (`PColumnData/Json`) is read. Partitioned JSON keeps its parts in files, and binary and parquet
 * data cannot be read in the model either.
 */
export function readExportValues(
  spec: Pick<PColumnSpec, "annotations">,
  data: undefined | JsonDataNode,
): ExportValues {
  const discrete = readAnnotationJson(spec, Annotation.DiscreteValues);
  if (discrete !== undefined) return { type: "known", cells: discrete };
  if (data === undefined) return { type: "pending" };

  return data.resourceType.name === RT_JSON ? readJsonData(data) : { type: "unreadable" };
}

/**
 * Labels of the given blocks, by block id. A block the runtime does not know, or cannot label, is
 * left out.
 */
export function readBlockLabels(
  blockIds: readonly string[],
  labelOf: (blockId: string) => string,
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const blockId of new Set(blockIds)) {
    try {
      labels[blockId] = labelOf(blockId);
    } catch {
      continue;
    }
  }
  return labels;
}

// Internals

const RT_JSON = "PColumnData/Json";

function valueKey(cell: unknown): string | undefined {
  if (isString(cell)) return cell;
  if (typeof cell === "number" && Number.isFinite(cell)) return String(cell);
  return undefined;
}

/** A JSON data resource holds its cells under `data`, keyed by the serialized axis values. */
function readJsonData(node: JsonDataNode): ExportValues {
  const content = node.getDataAsJsonOrUndefined();
  if (content === undefined) return { type: "pending" };
  if (!isPlainObject(content) || !isPlainObject(content.data)) return { type: "unreadable" };
  return { type: "known", cells: Object.values(content.data) };
}
