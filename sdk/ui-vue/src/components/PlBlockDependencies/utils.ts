import type {
  BlockDependenciesOutput,
  BlockDependentsOutput,
  ColumnUniversalId,
  ColumnValue,
  DependencyStatus,
  DependentStatus,
  UncheckedReason,
} from "@platforma-sdk/model";
import {
  collectColumnReferences,
  isColumnUniversalId,
  isColumnUniversalKey,
  isColumnValueId,
} from "@platforma-sdk/model";

/**
 * Which way a link goes: `usedBy` — another block's args reference an output of this block;
 * `uses` — this block's args reference an output of another block.
 */
export type LinkSide = "usedBy" | "uses";

/**
 * State of a link. An output that is not exported is `unavailable` on the
 * `uses` side — the other block does not export it — and `notExported` on the `usedBy` side —
 * this block does not export it.
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
 * or about every link to that block whose output is not exported and has no known label: such
 * outputs have no name a reader can tell apart. `outputs` names the outputs the line is about,
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

/**
 * The links of the outputs that are available. `usedBy` is left out when the output is
 * not computed yet or the runtime cannot list dependent blocks.
 */
export function linkSections(outputs: {
  dependents: undefined | BlockDependentsOutput;
  dependencies: undefined | BlockDependenciesOutput;
}): LinkSection[] {
  const { dependents, dependencies } = outputs;
  const sections: LinkSection[] = [];
  if (dependents !== undefined && dependents.type === "ok") {
    sections.push({
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
    });
  }
  if (dependencies !== undefined) {
    sections.push({
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
    });
  }
  return sections;
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
    const hint =
      section.side === "usedBy" && section.hasUnrunChanges ? UNRUN_CHANGES_HINT : alert.hint;
    return [{ side: section.side, ...alert, hint, issues }];
  });
}

/** The label of a block, or a short form of its id when it has no label. */
export function blockName(labels: Record<string, string>, blockId: string): string {
  return labels[blockId] ?? `Block ${blockId.slice(0, 8)}`;
}

/** Why a selected column or column value is missing: the block meant to provide it, and what went wrong. */
export interface MissingValueCause {
  blockId: string;
  blockName: string;
  /** What went wrong, as a sentence that follows the block name. */
  text: string;
}

/**
 * Why `value` is missing from its options, by the dependencies of the block: a column value id,
 * or a column — as an id or a ref. `undefined` for any other value, and for one whose column has
 * nothing wrong with it.
 */
export function describeMissingValue(
  dependencies: BlockDependenciesOutput,
  value: unknown,
): MissingValueCause | undefined {
  const reference = selectedReference(value);
  if (reference === undefined) return undefined;
  const entry = dependencies.items.find((item) => item.ref === reference.ref);
  if (entry === undefined) return undefined;

  const column = entry.columnLabel === null ? "the column" : `“${entry.columnLabel}”`;
  const text = missingValueCauseText(entry.status, column, reference.picked);
  if (text === undefined) return undefined;
  return {
    blockId: entry.producerBlockId,
    blockName: blockName(dependencies.labels, entry.producerBlockId),
    text,
  };
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
    case "broken":
      if (status.reason === "unavailable") return `does not provide ${column}.`;
      return picked !== undefined && status.values.some((v) => String(v) === String(picked))
        ? `has no “${picked}” in ${column}.`
        : undefined;
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
      return { type: "notExported" };
    case "missingValues":
      return { type: "missingValues", values: status.values.map(String) };
    case "ok":
    case "pending":
    case "unchecked":
      return status;
  }
}

function fromDependencyStatus(status: DependencyStatus): LinkStatus {
  if (status.type !== "broken") return status;
  return status.reason === "unavailable"
    ? { type: "unavailable" }
    : { type: "missingValues", values: status.values.map(String) };
}

function groupLinks(labels: Record<string, string>, sources: LinkSource[]): LinkRow[] {
  const rows = new Map<string, LinkRow>();
  for (const source of sources) {
    const key = JSON.stringify([source.blockId, source.output, source.values === null]);
    const values = source.values === null ? null : distinct(source.values.map(String));
    const row = rows.get(key);
    if (row === undefined) {
      rows.set(key, {
        key,
        blockId: source.blockId,
        blockName: blockName(labels, source.blockId),
        output: source.output,
        columnLabel: source.columnLabel,
        values,
        status: source.status,
      });
      continue;
    }
    if (row.columnLabel === null) row.columnLabel = source.columnLabel;
    if (row.values !== null && values !== null) row.values = distinct([...row.values, ...values]);
    row.status = mergeStatus(row.status, source.status);
  }
  return [...rows.values()];
}

/** The status of merged references: the one that needs attention most. */
function mergeStatus(a: LinkStatus, b: LinkStatus): LinkStatus {
  if (a.type === "missingValues" && b.type === "missingValues") {
    return { type: "missingValues", values: distinct([...a.values, ...b.values]) };
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
 * The `usedBy` hint while this block has changes its last run does not include: the links are
 * checked against that run, so the changes may fix them once the block is run.
 */
const UNRUN_CHANGES_HINT =
  "This block has changes that have not been run yet, and the check uses its last run. " +
  "Run the block to see whether they fix these links.";

/** A link whose status needs attention: it breaks a block or lacks picked values. */
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

/** Groups links into alert lines, each line in the place of its first link. */
function groupIssues(links: AttentionLink[]): (SingleIssue | UnlabeledIssue)[] {
  const groups: (SingleIssue | UnlabeledIssue)[] = [];
  const unlabeled = new Map<string, UnlabeledIssue>();
  for (const link of links) {
    const { row } = link;
    if (row.columnLabel !== null || link.status.type === "missingValues") {
      groups.push({ type: "single", link });
      continue;
    }
    const group = unlabeled.get(row.blockId);
    if (group === undefined) {
      const created: UnlabeledIssue = {
        type: "unlabeled",
        blockId: row.blockId,
        blockName: row.blockName,
        outputs: [row.output],
      };
      unlabeled.set(row.blockId, created);
      groups.push(created);
    } else if (!group.outputs.includes(row.output)) {
      group.outputs.push(row.output);
    }
  }
  return groups;
}

function toIssue(side: LinkSide, group: SingleIssue | UnlabeledIssue): LinkIssue {
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

function distinct(values: string[]): string[] {
  return [...new Set(values)];
}
