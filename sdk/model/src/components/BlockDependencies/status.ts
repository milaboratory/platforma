import {
  Annotation,
  collectColumnReferences,
  columnProducer,
  readAnnotationJson,
  type ColumnReference,
  type ColumnUniversalId,
  type ColumnValue,
  type PColumnSpec,
  type UpstreamBlockCtx,
} from "@milaboratories/pl-model-common";
import { isPlainObject, isString } from "es-toolkit";
import type {
  BlockDependenciesOutput,
  DependencyStatus,
  DependentStatus,
  UncheckedReason,
} from "./types";

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

/**
 * Where args of one kind — a block's args, or its prerun args — were read from:
 * - `current` — derived from the current data and ready;
 * - `draft` — derived from the current data, with errors its validation found;
 * - `lastRun` — the ones the last run, or the last prerun, ran on.
 */
export type ArgsStep = "current" | "draft" | "lastRun";

/** Args of one kind a block's references are read from. */
export type ChosenArgs = { step: ArgsStep; args: unknown } | { step: "none" };

/** Reads of args of one kind at each step; `undefined` when there are none at that step. */
export interface ArgsReads {
  current: () => unknown;
  draft: () => unknown;
  lastRun: () => unknown;
}

/** A block's args and its prerun args, as chosen by {@link chooseArgs}. */
export interface ChosenBlockArgs {
  args: ChosenArgs;
  prerunArgs: ChosenArgs;
}

/**
 * A block's args and its prerun args: for each, the current ones when the block can build them,
 * else the ones validation found errors in. Only when neither has either are the args of the last
 * run and of the last prerun read, for both: they were derived from earlier data, and their
 * references are not added to those of args derived from the current data. Each step is read
 * only when the ones before it give no args.
 */
export function chooseArgs(reads: { args: ArgsReads; prerunArgs: ArgsReads }): ChosenBlockArgs {
  const current = {
    args: firstArgs(reads.args, CURRENT_STEPS),
    prerunArgs: firstArgs(reads.prerunArgs, CURRENT_STEPS),
  };
  if (current.args.step !== "none" || current.prerunArgs.step !== "none") return current;
  return {
    args: firstArgs(reads.args, ["lastRun"]),
    prerunArgs: firstArgs(reads.prerunArgs, ["lastRun"]),
  };
}

/**
 * Which args the references of a block come from, over its args and its prerun args: `current`
 * when any of them is derived from the current data, ready or not; `lastRun` when all that was
 * read is of the last run; `none` when nothing was.
 */
export function combinedArgsSource(
  chosen: readonly ChosenArgs[],
): BlockDependenciesOutput["argsSource"] {
  if (chosen.some(({ step }) => step === "current" || step === "draft")) return "current";
  if (chosen.some(({ step }) => step === "lastRun")) return "lastRun";
  return "none";
}

/** Columns the chosen args reference; none when no args were chosen. */
export function chosenReferences(chosen: ChosenArgs): ColumnReference[] {
  return chosen.step === "none" ? [] : collectColumnReferences(chosen.args);
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
  getInputsLocked(): boolean;
  listInputFields(): string[];
  resolve(field: string): JsonDataNode | undefined;
}

/**
 * Cell values of an exported column. The `pl7.app/discreteValues` annotation, when the spec has
 * it, lists them without touching the data. Otherwise only JSON data — whole or partitioned — is
 * read; binary and parquet data cannot be read in the model.
 */
export function readExportValues(
  spec: Pick<PColumnSpec, "annotations">,
  data: undefined | JsonDataNode,
): ExportValues {
  const discrete = readAnnotationJson(spec, Annotation.DiscreteValues);
  if (discrete !== undefined) return { type: "known", cells: discrete };
  if (data === undefined) return { type: "pending" };

  switch (data.resourceType.name) {
    case RT_JSON:
      return readJsonPart(data);
    case RT_JSON_PARTITIONED: {
      if (!data.getInputsLocked()) return { type: "pending" };
      const cells: unknown[] = [];
      for (const field of data.listInputFields()) {
        const part = data.resolve(field);
        if (part === undefined) return { type: "pending" };
        const values = readJsonPart(part);
        if (values.type !== "known") return values;
        cells.push(...values.cells);
      }
      return { type: "known", cells };
    }
    default:
      return { type: "unreadable" };
  }
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

/** Steps of args derived from the current data, in the order they are read. */
const CURRENT_STEPS: readonly ArgsStep[] = ["current", "draft"];

function firstArgs(read: ArgsReads, steps: readonly ArgsStep[]): ChosenArgs {
  for (const step of steps) {
    const args = read[step]();
    if (args !== undefined) return { step, args };
  }
  return { step: "none" };
}

const RT_JSON = "PColumnData/Json";
const RT_JSON_PARTITIONED = "PColumnData/JsonPartitioned";

function valueKey(cell: unknown): string | undefined {
  if (isString(cell)) return cell;
  if (typeof cell === "number" && Number.isFinite(cell)) return String(cell);
  return undefined;
}

/** A JSON data resource holds its cells under `data`, keyed by the serialized axis values. */
function readJsonPart(node: JsonDataNode): ExportValues {
  const content = node.getDataAsJsonOrUndefined();
  if (content === undefined) return { type: "pending" };
  if (!isPlainObject(content) || !isPlainObject(content.data)) return { type: "unreadable" };
  return { type: "known", cells: Object.values(content.data) };
}
