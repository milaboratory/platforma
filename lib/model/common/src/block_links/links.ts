import { groupBy, uniq } from "es-toolkit";
import {
  collectColumnReferences,
  isColumnUniversalId,
  isColumnUniversalKey,
  isColumnValueId,
  type ColumnUniversalId,
  type ColumnValue,
} from "../drivers";
import type {
  BlockColumnLinks,
  BlockDependencies,
  DependencyEntry,
  DependencyStatus,
  DependentStatus,
  UncheckedReason,
} from "./types";

/**
 * Which way a link goes: `usedBy` — another block's args reference an output of this block;
 * `uses` — this block's args reference an output of another block.
 */
export type LinkSide = "usedBy" | "uses";

/**
 * State of a link. An output that is not exported is `unavailable` on the
 * `uses` side — the other block does not export it — and `notExported` on the `usedBy` side —
 * this block does not export it. An output of a block that has no last run yet is not exported
 * either: whether the block provides it is known only once it is run.
 */
export type LinkStatus =
  | { type: "ok" }
  | { type: "pending" }
  | { type: "unchecked"; reason: UncheckedReason }
  | { type: "unavailable" }
  | { type: "notExported" }
  | { type: "missingValues"; values: string[] };

/**
 * What one other block uses of one output, or what this block uses of one output of another
 * block. All references of that block to the output that pick values are merged into one link,
 * and its use of the output as a whole is a link of its own.
 */
export type LinkRow = {
  key: string;
  /** The other block: the one using this block's output, or the one producing the output. */
  blockId: string;
  blockName: string;
  /** Name of the output. It is not meant for reading, so it is shown only as a hint. */
  output: string;
  /** `pl7.app/label` of the column; `null` when it is not known. */
  columnLabel: null | string;
  /** Distinct picked values as strings; `null` when the block uses the column as a whole. */
  values: null | string[];
  status: LinkStatus;
};

/**
 * The links of one side. On the `usedBy` side, `hasUnrunChanges` tells whether this block has
 * changes its last run does not include: the links are checked against that run.
 */
export type LinkSection =
  | { side: "usedBy"; rows: LinkRow[]; hasUnrunChanges: boolean }
  | { side: "uses"; rows: LinkRow[] };

/**
 * A line about links that need attention: the other block's name, then a space and `text`. The
 * name is kept apart so it can be shown as a way to open that block. A line is about one link,
 * about every link to that block whose output is not exported and has no known label: such
 * outputs have no name a reader can tell apart, or about every link to a block that has not been
 * run yet: they all wait for its run. `outputs` names the outputs the line is about,
 * for a hint.
 */
export type LinkIssue = {
  key: string;
  blockId: string;
  blockName: string;
  text: string;
  outputs: string[];
};

/**
 * The links of one side that need attention. `error` on the `uses` side: this block cannot run
 * against them. `warn` on the `usedBy` side: the other blocks are the ones to fix, by getting
 * the data back here or by being reconfigured; `hint` says so.
 */
export type LinkAlert = {
  side: LinkSide;
  type: "error" | "warn";
  label: string;
  hint: null | string;
  issues: LinkIssue[];
};

/** The links of both sides: `usedBy`, then `uses`. */
export function linkSections(links: BlockColumnLinks): LinkSection[] {
  const { dependents, dependencies } = links;
  return [
    {
      side: "usedBy",
      hasUnrunChanges: dependents.hasUnrunChanges,
      rows: groupLinks(
        dependents.labels,
        dependents.items.map((item) => ({
          blockId: item.dependentBlockId,
          output: item.output,
          columnLabel: item.columnLabel,
          values: item.values,
          status: fromDependentStatus(item.status),
        })),
      ),
    },
    {
      side: "uses",
      rows: groupLinks(
        dependencies.labels,
        dependencies.items.map((item) => ({
          blockId: item.producerBlockId,
          output: item.output,
          columnLabel: item.columnLabel,
          values: item.values,
          status: fromDependencyStatus(item.status),
        })),
      ),
    },
  ];
}

/**
 * One alert per side whose links need attention, in the order of the sections:
 * - `uses` — an output this block uses is not available or lacks picked values;
 * - `usedBy` — another block uses an output this block does not export, or picked values this
 *   block's output lacks. While this block has changes not run yet, the hint says that the links
 *   are checked against its last run.
 */
export function linkAlerts(sections: LinkSection[]): LinkAlert[] {
  return sections.flatMap((section): LinkAlert[] => {
    const links = section.rows.flatMap((row) => attentionLink(row) ?? []);
    if (links.length === 0) return [];
    const issues = groupIssues(links).map((group) => toIssue(section.side, group));
    const alert = ALERTS[section.side];
    const hint = section.side === "usedBy" ? usedByHint(section.hasUnrunChanges) : alert.hint;
    return [{ side: section.side, ...alert, hint, issues }];
  });
}

/** The label of a block, or a short form of its id when it has no label. */
export function blockName(labels: Record<string, string>, blockId: string): string {
  return labels[blockId] ?? `Block ${blockId.slice(0, 8)}`;
}

/**
 * Why a selected column or column value is missing. `source`: the block meant to provide it, and
 * what went wrong, as a sentence that follows the block name. `waiting`: its column is provided,
 * while other inputs of the block are not, and the options of one input may be made from another.
 * `name`: what the selection is called — the picked value, or the label of a column selected as a
 * whole; `null` when the column has no known label.
 */
export type MissingValueCause =
  | { type: "source"; name: string | null; blockId: string; blockName: string; text: string }
  | { type: "waiting"; name: string | null; text: string };

/**
 * Why `value` is missing from its options, by the dependencies of the block: a column value id,
 * or a column — as an id or a ref. When its column is provided, with the value, while other
 * inputs of the block are not, the block offers it once they are: the options of one input may
 * be made from another. `undefined` for any other value, and for one whose column has nothing
 * wrong with it while every other input is provided too.
 */
export function describeMissingValue(
  dependencies: BlockDependencies,
  value: unknown,
): MissingValueCause | undefined {
  const reference = selectedReference(value);
  if (reference === undefined) return undefined;
  const entry = dependencies.items.find((item) => item.ref === reference.ref);
  if (entry === undefined) return undefined;

  const column = entry.columnLabel === null ? "the column" : `“${entry.columnLabel}”`;
  const text = missingValueCauseText(entry.status, column, reference.picked);
  const name = reference.picked ?? entry.columnLabel;
  if (text !== undefined) {
    return {
      type: "source",
      name,
      blockId: entry.producerBlockId,
      blockName: blockName(dependencies.labels, entry.producerBlockId),
      text,
    };
  }
  return waitsForOtherInputs(dependencies, entry, reference.picked)
    ? { type: "waiting", name, text: "Waiting for the other inputs of this block." }
    : undefined;
}

// Internals

/** The column `value` selects, with the value of it a column value id picks. */
function selectedReference(
  value: unknown,
): { ref: ColumnUniversalId; picked: ColumnValue | undefined } | undefined {
  const isColumn = isColumnUniversalId(value) || isColumnUniversalKey(value);
  if (!isColumnValueId(value) && !isColumn) return undefined;
  const [reference] = collectColumnReferences(value);
  if (reference === undefined) return undefined;
  if (reference.values === null)
    return isColumn ? { ref: reference.ref, picked: undefined } : undefined;
  return { ref: reference.ref, picked: reference.values[0] };
}

function missingValueCauseText(
  status: DependencyStatus,
  column: string,
  picked: ColumnValue | undefined,
): string | undefined {
  switch (status.type) {
    case "ok":
    case "unchecked":
      return undefined;
    case "pending":
      return `is still computing ${column}.`;
    case "notRun":
      return `does not provide ${column}.`;
    case "broken":
      if (status.reason === "unavailable") return `does not provide ${column}.`;
      return picked !== undefined && status.values.includes(picked)
        ? `has no “${picked}” in ${column}.`
        : undefined;
  }
}

/** Whether a selected column is provided, with the picked value, while another input is not. */
function waitsForOtherInputs(
  dependencies: BlockDependencies,
  entry: DependencyEntry,
  picked: ColumnValue | undefined,
): boolean {
  if (!providesPick(entry.status, picked)) return false;
  return dependencies.items.some(
    (item) =>
      item.ref !== entry.ref && item.status.type !== "ok" && item.status.type !== "unchecked",
  );
}

/** Whether a column is provided with the picked value, as far as it was checked. */
function providesPick(status: DependencyStatus, picked: ColumnValue | undefined): boolean {
  switch (status.type) {
    case "ok":
      return true;
    case "broken":
      return (
        status.reason === "missingValues" &&
        (picked === undefined || !status.values.includes(picked))
      );
    case "unchecked":
    case "pending":
    case "notRun":
      return false;
  }
}

type LinkSource = {
  blockId: string;
  output: string;
  columnLabel: null | string;
  values: null | ColumnValue[];
  status: LinkStatus;
};

function fromDependentStatus(status: DependentStatus): LinkStatus {
  switch (status.type) {
    case "broken":
    case "notRun":
      return { type: "notExported" };
    case "missingValues":
      return { type: "missingValues", values: status.values };
    case "ok":
    case "pending":
    case "unchecked":
      return status;
  }
}

function fromDependencyStatus(status: DependencyStatus): LinkStatus {
  if (status.type === "notRun") return { type: "unavailable" };
  if (status.type !== "broken") return status;
  return status.reason === "unavailable"
    ? { type: "unavailable" }
    : { type: "missingValues", values: status.values.map(String) };
}

function groupLinks(labels: Record<string, string>, sources: LinkSource[]): LinkRow[] {
  const rows = sources.map((source): LinkRow => {
    const key = JSON.stringify([source.blockId, source.output, source.values === null]);
    return {
      key,
      blockId: source.blockId,
      blockName: blockName(labels, source.blockId),
      output: source.output,
      columnLabel: source.columnLabel,
      values: source.values === null ? null : uniq(source.values.map(String)),
      status: source.status,
    };
  });
  return Object.values(groupBy(rows, (row) => row.key)).map((group) => group.reduce(mergeRows));
}

/** Two rows of one key: references to one output of one block, picking values or not. */
function mergeRows(a: LinkRow, b: LinkRow): LinkRow {
  return {
    ...a,
    columnLabel: a.columnLabel ?? b.columnLabel,
    values: a.values !== null && b.values !== null ? uniq([...a.values, ...b.values]) : a.values,
    status: mergeStatus(a.status, b.status),
  };
}

/** The status of merged references: the one that needs attention most. */
function mergeStatus(a: LinkStatus, b: LinkStatus): LinkStatus {
  if (a.type === "missingValues" && b.type === "missingValues") {
    return { type: "missingValues", values: uniq([...a.values, ...b.values]) };
  }
  return STATUS_RANK[b.type] > STATUS_RANK[a.type] ? b : a;
}

const STATUS_RANK: Record<LinkStatus["type"], number> = {
  ok: 0,
  unchecked: 1,
  pending: 2,
  missingValues: 3,
  unavailable: 4,
  notExported: 4,
};

const ALERTS: Record<LinkSide, Pick<LinkAlert, "type" | "label" | "hint">> = {
  uses: {
    type: "error",
    label: "Links to blocks this block takes data from are broken",
    hint: null,
  },
  usedBy: {
    type: "warn",
    label: "Some blocks are missing data from this block",
    hint: "Add the missing data to this block, or reconfigure those blocks.",
  },
};

/**
 * The `usedBy` hint: that the links are checked against the last run while this block has changes
 * that run does not include, so the changes may fix them once the block is run.
 */
function usedByHint(hasUnrunChanges: boolean): null | string {
  return hasUnrunChanges ? UNRUN_CHANGES_HINT : ALERTS.usedBy.hint;
}

const UNRUN_CHANGES_HINT =
  "This block has changes that have not been run yet, and the check uses its last run. " +
  "Run the block to see whether they fix these links.";

/** A link whose status needs attention: it breaks a block, or lacks picked values. */
type AttentionLink = { row: LinkRow; status: AttentionStatus };

type AttentionStatus = Extract<
  LinkStatus,
  { type: "unavailable" | "notExported" | "missingValues" }
>;

/** The row as a link needing attention; `undefined` when it does not. */
function attentionLink(row: LinkRow): undefined | AttentionLink {
  const { status } = row;
  switch (status.type) {
    case "unavailable":
    case "notExported":
    case "missingValues":
      return { row, status };
    case "ok":
    case "pending":
    case "unchecked":
      return undefined;
  }
}

/** One link an alert line is about. */
type SingleIssue = { type: "single"; link: AttentionLink };

/** Every link to one block whose output is not exported and has no known label. */
type UnlabeledIssue = { type: "unlabeled"; blockId: string; blockName: string; outputs: string[] };

type Issue = SingleIssue | UnlabeledIssue;

/** Groups links into alert lines, each line in the place of its first link. */
function groupIssues(links: AttentionLink[]): Issue[] {
  const keyed = links.map((link, index) => ({ link, key: issueKey(link, index) }));
  return Object.values(groupBy(keyed, ({ key }) => key)).map((group): Issue => {
    const [{ link }] = group;
    const { blockId, blockName } = link.row;
    if (!isUnlabeled(link)) return { type: "single", link };
    const outputs = uniq(group.map((item) => item.link.row.output));
    return { type: "unlabeled", blockId, blockName, outputs };
  });
}

function issueKey(link: AttentionLink, index: number): string {
  const blockId = JSON.stringify(link.row.blockId);
  return isUnlabeled(link) ? `unlabeled/${blockId}` : `single/${index}`;
}

/** A link to an output that is not exported and has no known label. */
function isUnlabeled(link: AttentionLink): boolean {
  const { type } = link.status;
  return link.row.columnLabel === null && (type === "unavailable" || type === "notExported");
}

function toIssue(side: LinkSide, group: Issue): LinkIssue {
  if (group.type === "unlabeled") {
    return {
      key: `${side}/${JSON.stringify([group.blockId])}`,
      blockId: group.blockId,
      blockName: group.blockName,
      text: describeUnlabeled(side, group.outputs.length),
      outputs: group.outputs,
    };
  }
  const { row } = group.link;
  return {
    key: `${side}/${row.key}`,
    blockId: row.blockId,
    blockName: row.blockName,
    text: describeIssue(side, group.link),
    outputs: [row.output],
  };
}

/**
 * Outputs of one block that are not exported and have no known label, as words that follow the
 * other block's name and a space. One such output is the data in question; several are counted.
 */
function describeUnlabeled(side: LinkSide, count: number): string {
  const what = count === 1 ? "data" : `${count} outputs`;
  return side === "uses"
    ? `does not provide ${what} this block uses`
    : `uses ${what} this block does not export`;
}

/**
 * What is wrong with one link, as words that follow the other block's name and a space. The
 * column is named by its label, quoted; a column with no known label is named by its role.
 */
function describeIssue(side: LinkSide, { row, status }: AttentionLink): string {
  const column = row.columnLabel === null ? null : `"${row.columnLabel}"`;
  switch (status.type) {
    case "unavailable":
    case "notExported":
      if (column === null) return describeUnlabeled(side, 1);
      return side === "uses"
        ? `does not provide ${column}`
        : `uses ${column}, which this block does not export`;
    case "missingValues": {
      const values = quoteValues(status.values);
      if (side === "uses") return `has no ${values} in ${column ?? "data this block uses"}`;
      return column === null
        ? `uses ${values}, which this block's data no longer has`
        : `uses ${values} of ${column}, which this block no longer has`;
    }
  }
}

/** Picked values for display: quoted, comma-separated. */
function quoteValues(values: string[]): string {
  return values.map((value) => `"${value}"`).join(", ");
}
