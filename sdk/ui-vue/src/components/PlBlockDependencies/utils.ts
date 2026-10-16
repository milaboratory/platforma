import type {
  BlockDependenciesOutput,
  BlockDependentsOutput,
  ColumnValue,
  DependencyStatus,
  DependentStatus,
  UncheckedReason,
} from "@platforma-sdk/model";

/**
 * Which way a link goes: `usedBy` — another block's args reference an output of this block;
 * `uses` — this block's args reference an output of another block.
 */
export type LinkSide = "usedBy" | "uses";

/**
 * State of a link as the panel shows it. An output that is not exported is `unavailable` on the
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
 * Status tag of a link: `HOLD` for states that are not a problem yet. `hint` explains the tag in
 * one sentence when its text alone does not.
 */
export type LinkTag = { type: "OK" | "WARN" | "ALERT" | "HOLD"; text: string; hint: null | string };

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
  tag: LinkTag;
};

/** One side of the links, for the panel. `note` explains where the links were read from. */
export type LinkSection = {
  side: LinkSide;
  title: string;
  note: null | string;
  emptyText: string;
  rows: LinkRow[];
};

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
 * The links of one side that need attention. `error` when any of them breaks a block — its tag
 * is an alert — `warn` otherwise.
 */
export type LinkAlert = {
  side: LinkSide;
  type: "error" | "warn";
  label: string;
  issues: LinkIssue[];
};

/**
 * The panel sections for the outputs that are available. `usedBy` is left out when the output is
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
      title: "Used by",
      note: null,
      emptyText: "No block uses outputs of this block",
      rows: groupLinks(
        "usedBy",
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
      title: "Uses",
      note:
        dependencies.argsSource === "lastRun"
          ? "As of the last run: the current settings of this block are incomplete"
          : null,
      emptyText:
        dependencies.argsSource === "none"
          ? "Not known yet: the settings of this block are incomplete"
          : "This block uses no outputs of other blocks",
      rows: groupLinks(
        "uses",
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
 *   block's output lacks.
 */
export function linkAlerts(sections: LinkSection[]): LinkAlert[] {
  return sections.flatMap((section): LinkAlert[] => {
    const links = section.rows.flatMap((row) => attentionLink(row) ?? []);
    if (links.length === 0) return [];
    const issues = groupIssues(links).map((group) => toIssue(section.side, group));
    const type = links.some((link) => link.row.tag.type === "ALERT") ? "error" : "warn";
    return [{ side: section.side, type, label: ALERT_LABELS[section.side], issues }];
  });
}

/**
 * The column of a link as the panel names it: its label, else what is known about it. An output
 * name is not meant for reading, so it is never the column's name.
 */
export function describeColumn(row: Pick<LinkRow, "columnLabel" | "status">): string {
  if (row.columnLabel !== null) return row.columnLabel;
  return isNotExported(row.status) ? "Unavailable output" : "Unnamed output";
}

/** The picked values for display, or a note that the whole column is used. */
export function describeValues(values: null | string[]): string {
  if (values === null) return "Whole column";
  return values.map((value) => `"${value}"`).join(", ");
}

/** The label of a block, or a short form of its id when it has no label. */
export function blockName(labels: Record<string, string>, blockId: string): string {
  return labels[blockId] ?? `Block ${blockId.slice(0, 8)}`;
}

/**
 * The tag of a link. A problem with an output this block uses breaks this block, so it is an
 * alert, and so is an output another block uses that this block does not export; values another
 * block picked and this block's output lacks break the other block, so here it is a warning.
 */
export function linkTag(side: LinkSide, status: LinkStatus): LinkTag {
  switch (status.type) {
    case "ok":
      return { type: "OK", text: "OK", hint: null };
    case "pending":
      return { type: "HOLD", text: "Pending", hint: null };
    case "unchecked":
      return { type: "HOLD", ...UNCHECKED_TAGS[status.reason] };
    case "unavailable":
      return { type: side === "uses" ? "ALERT" : "WARN", text: "Unavailable", hint: null };
    case "notExported":
      return {
        type: "ALERT",
        text: "Not exported",
        hint: "This block does not export this output: it has not run, or the column was removed.",
      };
    case "missingValues":
      return { type: side === "uses" ? "ALERT" : "WARN", text: "Missing values", hint: null };
  }
}

// Internals

const UNCHECKED_TAGS: Record<UncheckedReason, { text: string; hint: string }> = {
  unreadable: {
    text: "Values not readable",
    hint: "The column's values cannot be read here, so the picked values were not checked.",
  },
  unsupported: {
    text: "Needs a newer app",
    hint: "This version of the app cannot check links.",
  },
};

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

function groupLinks(
  side: LinkSide,
  labels: Record<string, string>,
  sources: LinkSource[],
): LinkRow[] {
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
        tag: linkTag(side, source.status),
      });
      continue;
    }
    if (row.columnLabel === null) row.columnLabel = source.columnLabel;
    if (row.values !== null && values !== null) row.values = distinct([...row.values, ...values]);
    row.status = mergeStatus(row.status, source.status);
    row.tag = linkTag(side, row.status);
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

const ALERT_LABELS: Record<LinkSide, string> = {
  uses: "Links to blocks this block takes data from are broken",
  usedBy: "Blocks that use data of this block are affected",
};

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
      const values = describeValues(status.values);
      if (side === "uses") return `has no ${values} in ${column ?? "data this block uses"}`;
      return column === null
        ? `uses ${values}, which this block's data no longer has`
        : `uses ${values} of ${column}, which this block no longer has`;
    }
  }
}

/** Whether the output of a link is not exported, seen from either side. */
function isNotExported(status: LinkStatus): boolean {
  return status.type === "unavailable" || status.type === "notExported";
}

function distinct(values: string[]): string[] {
  return [...new Set(values)];
}
