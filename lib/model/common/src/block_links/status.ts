import { isEqual, isPlainObject, isString, uniq } from "es-toolkit";
import {
  Annotation,
  columnProducer,
  readAnnotationJson,
  type ColumnReference,
  type ColumnUniversalId,
  type ColumnValue,
  type PColumnSpec,
} from "../drivers";
import type { DependencyStatus, DependentStatus, UncheckedReason } from "./types";

/** What the last run of a block exports under one output name. */
export type ExportLookup =
  | { type: "unavailable" }
  | { type: "pending" }
  | { type: "notRun" }
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
  | { type: "notRun" }
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
 * Whether a block has changes its last run does not include: its current args differ from those
 * of the last run, or it was never run. A block without current args cannot be run as it is, so
 * it has none.
 */
export function hasUnrunChanges(reads: {
  current: () => unknown;
  lastRun: () => unknown;
}): boolean {
  const current = reads.current();
  if (current === undefined) return false;
  const lastRun = reads.lastRun();
  return lastRun === undefined || !isEqual(current, lastRun);
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
 * The last run of a block, as far as what it exports goes:
 * - `notRun` — the block has no last run;
 * - `rendering` — the block has a last run whose results are not there yet;
 * - `failed` — the results of the last run failed to render, so the run exports nothing;
 * - `rendered` — `ctx` holds the results of the last run.
 */
export type ProducerRun<A> =
  | { type: "notRun" }
  | { type: "rendering" }
  | { type: "failed" }
  | { type: "rendered"; ctx: A };

/**
 * How far the last run of a block has listed its exports: `notRun` — the block has no last run,
 * so it exports nothing until it runs; `open` — its results are still being rendered, or their
 * list is still open, so it may export more; `final` — it has listed everything it exports.
 */
export function producerRunState<A>(
  run: ProducerRun<A>,
  inputsLocked: (ctx: A) => boolean,
): "notRun" | "open" | "final" {
  switch (run.type) {
    case "notRun":
      return "notRun";
    case "rendering":
      return "open";
    case "failed":
      return "final";
    case "rendered":
      return inputsLocked(run.ctx) ? "final" : "open";
  }
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
    if (found.type !== "present") return { check: { type: found.type }, columnLabel };
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

/** A reference a block holds: a column its producer does not export is broken. */
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
    case "notRun":
      return { type: check.type };
  }
}

/**
 * A reference to a block's output: an output the block does not export breaks the block holding
 * the reference.
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
    case "notRun":
      return { type: check.type };
  }
}

/**
 * Picked values the cells do not hold, in picked order. A number cell holds its decimal string,
 * the form a value is picked in. Null cells, and cells other than strings and finite numbers,
 * hold no value that can be picked.
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
  return picked.filter((value) => !present.has(value));
}

/** The data node surface {@link readExportValues} reads. */
export interface JsonDataNode {
  readonly resourceType: { readonly name: string };
  /** Whether the resource is ready or failed; a computation that reads it re-runs when this changes. */
  getIsReadyOrError(): boolean;
  /** The error of a failed resource; `undefined` when it has none. */
  getError(): unknown;
  /** `undefined` while the resource holds no data. */
  getDataAsJson(): unknown;
}

/**
 * The data of an exported column as a run holds it: still to arrive, left out of the results
 * block UIs read, or there.
 */
export type ExportData =
  | { type: "pending" }
  | { type: "absent" }
  | { type: "present"; node: JsonDataNode };

/**
 * Cell values of an exported column: those the `pl7.app/discreteValues` annotation lists, when
 * the spec has it, else those read from the data. Only data stored inline as JSON
 * (`PColumnData/Json`) is read. Partitioned JSON keeps its parts in files, and binary and parquet
 * data cannot be read here either.
 */
export function readExportValues(
  spec: Pick<PColumnSpec, "annotations">,
  readData: () => ExportData,
): ExportValues {
  const discrete = readAnnotationJson(spec, Annotation.DiscreteValues);
  if (discrete !== undefined) return { type: "known", cells: discrete };

  const data = readData();
  switch (data.type) {
    case "pending":
      return { type: "pending" };
    case "absent":
      return { type: "unreadable" };
    case "present":
      return data.node.resourceType.name === RT_JSON
        ? readJsonData(data.node)
        : { type: "unreadable" };
  }
}

/**
 * Labels of the given blocks, by block id. A block that cannot be labelled is left out.
 */
export function readBlockLabels(
  blockIds: readonly string[],
  labelOf: (blockId: string) => string,
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const blockId of uniq(blockIds)) {
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

/**
 * A JSON data resource holds its cells under `data`, keyed by the serialized axis values. Its
 * data is there once the resource is ready; a failed resource has none to read.
 */
function readJsonData(node: JsonDataNode): ExportValues {
  if (!node.getIsReadyOrError()) return { type: "pending" };
  if (node.getError() !== undefined) throw new Error("The column data failed to compute");
  const content = node.getDataAsJson();
  if (content === undefined) return { type: "pending" };
  if (!isPlainObject(content) || !isPlainObject(content.data)) return { type: "unreadable" };
  return { type: "known", cells: Object.values(content.data) };
}
