import { readSession } from "./recorder";
import { REDACTION, type ColumnDigest, type JoinNodeDigest } from "./digest";
import { formatBytes, formatCount, type SessionAnalysis } from "./analyze";
import type { FlightRecord } from "./events";

/** Renders an analysis as the markdown report a developer reads. */
export function renderReport(analysis: SessionAnalysis): string {
  const { records } = readSession(analysis.file);
  const culprit = findCulpritJoin(records, analysis);
  const offHeap = (analysis.memory.externalGrowth ?? 0) + (analysis.memory.arrayBuffersGrowth ?? 0);

  return [
    "# Platforma OOM flight report",
    "",
    `**Verdict — ${analysis.verdict.likelyCause ?? "no rule matched"}**`,
    "",
    analysis.verdict.summary,
    "",
    table("Where it stopped", [
      row("Outcome", analysis.verdict.outcome),
      row("Last unfinished operation", analysis.verdict.where),
      row("Memory region that grew", analysis.verdict.memoryRegion ?? "not classified"),
      row("Peak RSS", formatBytes(analysis.memory.peakRss)),
      row("RSS at last sample", formatBytes(analysis.memory.rssAtDeath)),
      row(
        "JS heap at last record",
        `${formatBytes(analysis.memory.heapUsedAtDeath)} of ${formatBytes(analysis.memory.heapLimit)}` +
          (analysis.memory.heapPressure
            ? ` (${Math.round(analysis.memory.heapPressure * 100)}%)`
            : ""),
      ),
      row(
        "Off-heap allocated (external + ArrayBuffers)",
        `${formatBytes(offHeap)} — allocated size, which exceeds resident memory when pages are never written`,
      ),
      row(
        "Sampler series",
        analysis.memory.samplerPresent
          ? `${analysis.memory.sampleCount} samples`
          : "absent (in-thread records only)",
      ),
      row("Worst recorded thread stall", `${Math.round(analysis.memory.worstStallMs)} ms`),
      row("Log tail truncated by the kill", String(analysis.truncatedTail)),
      row(
        "Supervisor crash marker",
        analysis.crashMarker
          ? `${analysis.crashMarker.reason}${
              analysis.crashMarker.errorCode ? ` (${analysis.crashMarker.errorCode})` : ""
            }`
          : "none — the parent process did not record the cause",
      ),
    ]),
    "",
    "## RSS over the session",
    "",
    "```",
    sparkline(analysis.memory.rssSeries),
    "```",
    "",
    findingsSection(analysis),
    "",
    attributionSection(analysis),
    "",
    culpritSection(culprit),
    "",
    rendersSection(analysis),
    "",
    timelineSection(analysis),
    "",
    nextStepsSection(analysis),
    "",
    table("Environment", [
      row("Role", analysis.role),
      row("Node", analysis.env?.node),
      row("Platform", analysis.env?.platform),
      row("Machine memory", formatBytes(analysis.env?.totalMemory)),
      row("CPUs", analysis.env?.cpus),
      row("V8 heap limit", formatBytes(analysis.env?.heapLimit)),
      row("execArgv", (analysis.env?.execArgv ?? []).join(" ") || "(none)"),
      row("App meta", JSON.stringify(analysis.meta ?? {})),
      row("Session", analysis.sessionId),
      row("Records", analysis.recordCount),
    ]),
    "",
    "## What this report contains",
    "",
    `Kept: ${REDACTION.kept.join(", ")}.`,
    "",
    `Never recorded: ${REDACTION.dropped.join(", ")}.`,
    "",
  ].join("\n");
}

// Internals

type Culprit = { seq: number; type: string; def: Record<string, unknown> };

function findingsSection(analysis: SessionAnalysis): string {
  if (analysis.findings.length === 0) return "## Findings\n\nNo rule fired.";
  const lines = ["## Findings", "", "| Severity | Rule | Detail |", "| --- | --- | --- |"];
  for (const finding of analysis.findings) {
    lines.push(`| ${finding.severity} | \`${finding.rule}\` | ${escapeCell(finding.detail)} |`);
  }
  return lines.join("\n");
}

function attributionSection(analysis: SessionAnalysis): string {
  if (analysis.attribution.length === 0) {
    return "## Memory attribution\n\nNo completed operation carried a memory delta.";
  }
  const lines = [
    "## Memory attribution — RSS growth per completed operation",
    "",
    "| Op | seq | Duration | RSS delta | Heap delta |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const op of analysis.attribution) {
    lines.push(
      `| ${op.op} | ${op.seq} | ${op.ms ?? "?"} ms | ${formatBytes(op.rssDelta)} | ${formatBytes(
        op.heapDelta ?? 0,
      )} |`,
    );
  }
  lines.push(
    "",
    "The operation that never completed does not appear here — it is in the verdict above.",
  );
  return lines.join("\n");
}

function culpritSection(culprit: Culprit | undefined): string {
  if (!culprit) {
    return "## Join in flight\n\nNo join definition was recorded for the failing operation.";
  }
  const lines = [`## Join in flight (seq ${culprit.seq}, \`${culprit.type}\`)`, ""];
  const def = culprit.def as {
    kind?: string;
    query?: unknown;
    columnCount?: number;
    inputRows?: number;
    columns?: ColumnDigest[];
    tree?: JoinNodeDigest;
    filters?: unknown[];
    partitionFilters?: unknown[];
  };

  if (def.kind === "PTableDefV2") {
    lines.push("Query-based def (V2):", "", "```", JSON.stringify(def.query, null, 1), "```");
    return lines.join("\n");
  }
  if (def.kind === "PFrameDef") {
    lines.push(
      `PFrame with ${def.columnCount} columns, ${formatCount(def.inputRows)} input rows.`,
      "",
      "```",
      (def.columns ?? []).map((column) => `  ${columnLine(column)}`).join("\n"),
      "```",
    );
    return lines.join("\n");
  }

  lines.push("```", renderTree(def.tree, ""), "```");
  const filters = [...(def.partitionFilters ?? []), ...(def.filters ?? [])];
  if (filters.length > 0) {
    lines.push(
      "",
      `Filters: ${(def.partitionFilters ?? []).length} partition, ${(def.filters ?? []).length} record.`,
      "",
      "```",
      JSON.stringify(filters, null, 1),
      "```",
    );
  }
  return lines.join("\n");
}

function renderTree(node: JoinNodeDigest | undefined, indent: string): string {
  if (!node) return `${indent}(none)`;
  if (!node.children) return `${indent}${columnLine(node)}`;
  const head =
    `${indent}${node.k}  children=${node.children.length}` +
    `  sharedAxes=${node.sharedAxes?.length ?? 0}` +
    (node.disjointPairs?.length ? `  !! DISJOINT ${JSON.stringify(node.disjointPairs)}` : "") +
    `  inputRowsMax=${formatCount(node.inputRowsMax)}` +
    (node.rowsUpperBound ? `  rowsUpperBound=${formatCount(node.rowsUpperBound)}` : "");
  const axes = `${indent}  axisUnion: ${(node.axisUnion ?? []).join("  ") || "(none)"}`;
  return [head, axes, ...node.children.map((child) => renderTree(child, `${indent}    `))].join(
    "\n",
  );
}

function columnLine(node: ColumnDigest): string {
  const spec = node.spec;
  const axes = spec.axes.map((axis) => axis.id).join(" , ");
  return (
    `${node.k ?? "column"}  ${spec.name ?? "?"} : ${spec.valueType ?? "?"}` +
    `  axes=[${axes}]` +
    `  data=${node.data.kind}` +
    (node.data.parts !== undefined ? ` parts=${node.data.parts}` : "") +
    (node.rows !== undefined ? ` rows=${formatCount(node.rows)}` : " rows=unknown") +
    (node.bytes !== undefined ? ` bytes=${formatBytes(node.bytes)}` : "")
  );
}

function rendersSection(analysis: SessionAnalysis): string {
  if (analysis.renders.length === 0) return "## Model renders\n\nNone recorded.";
  const lines = [
    "## Model renders",
    "",
    "| Block | seq | Finished | ms | Sandbox bytes out |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const render of analysis.renders.slice(-12)) {
    const name = render.blockId ?? render.block ?? render.key ?? "?";
    const finished = render.end ? (render.failed ? "error" : "yes") : "**NO**";
    const serOut =
      render.stats?.serOutBytes !== undefined ? formatBytes(render.stats.serOutBytes) : "-";
    lines.push(`| ${name} | ${render.seq} | ${finished} | ${render.ms ?? "-"} | ${serOut} |`);
  }
  return lines.join("\n");
}

function timelineSection(analysis: SessionAnalysis): string {
  const lines = ["## Last records before the log ends", "", "```"];
  for (const record of analysis.timeline) {
    const type = record.type as string;
    if (type === "mem-sampler" || type === "mem-self") continue;
    const rss = record.rss as number | undefined;
    const time = new Date(record.wall as number).toISOString().slice(11, 23);
    lines.push(
      `${String(record.seq).padStart(5)}  ${time}  ` +
        `${(rss !== undefined ? formatBytes(rss) : "").padStart(9)}  ${type}` +
        extraFields(record),
    );
  }
  lines.push("```");
  return lines.join("\n");
}

const TIMELINE_FIELDS = [
  "blockId",
  "handle",
  "rows",
  "columns",
  "amplification",
  "returnedBytes",
  "unbounded",
  "tableRows",
  "columnCount",
  "ms",
  "error",
];

function extraFields(record: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of TIMELINE_FIELDS) {
    const value = record[key];
    if (value === undefined) continue;
    parts.push(`${key}=${key === "returnedBytes" ? formatBytes(value as number) : value}`);
  }
  const range = record.range as { offset: number; length: number } | null | undefined;
  if (range) parts.push(`range=${range.offset}+${range.length}`);
  if (record.defSummary) parts.push(`def=${JSON.stringify(record.defSummary)}`);
  return parts.length > 0 ? `  ${parts.join(" ")}` : "";
}

const NEXT_STEPS: { rule: string; step: string }[] = [
  {
    rule: "cross-join",
    step: "The join tree has siblings with no axis in common. Find where the model assembles that join and check the axis specs of the columns it pulls from the result pool — output size is the product of the inputs.",
  },
  {
    rule: "axis-domain-mismatch",
    step: "The same axis name and type appears with different domains inside one join, so the join key does not match. Compare the domains listed in the findings against what the producing block writes.",
  },
  {
    rule: "unbounded-getData",
    step: "A getData call has no row range. Page it, or drive it from the table viewport.",
  },
  {
    rule: "join-amplification",
    step: "Output rows far exceed the largest input. Log the axis union at each join node and find the level where the count explodes.",
  },
  {
    rule: "huge-inline-column",
    step: "The model built a large inline column inside the sandbox. Move that work into the workflow so it never crosses the QuickJS boundary.",
  },
  {
    rule: "js-heap-exhaustion-confirmed",
    step: "The supervisor confirmed a JS heap limit breach in the middle-layer thread, so the growth is in JavaScript objects, not the native engine. Reproduce with --heapsnapshot-near-heap-limit=1 on that worker to get the retaining set.",
  },
  {
    rule: "js-heap-exhaustion",
    step: "Growth is inside the JS heap. A heap snapshot from the next reproduction would name the retaining objects.",
  },
  {
    rule: "off-heap-buffer-growth",
    step: "Growth is outside the JS heap, so raising --max-old-space-size will not help. Ask for a pframes engine heap profile (pprofDump) alongside this report.",
  },
  {
    rule: "native-allocation-growth",
    step: "Growth is outside the JS heap, so raising --max-old-space-size will not help. Ask for a pframes engine heap profile (pprofDump) alongside this report.",
  },
  {
    rule: "heap-reading-stale",
    step: "The heap was not sampled near the crash because the thread was blocked. Treat the heap numbers in this report as a floor, not a measurement.",
  },
];

function nextStepsSection(analysis: SessionAnalysis): string {
  const rules = new Set(analysis.findings.map((finding) => finding.rule));
  const steps = NEXT_STEPS.filter((entry) => rules.has(entry.rule)).map((entry) => entry.step);
  if (!analysis.memory.samplerPresent) {
    steps.push(
      "No sampler series in this session: the RSS curve came from in-thread records only and may have gaps where the thread was blocked.",
    );
  }
  if (steps.length === 0) {
    steps.push("No rule fired. Send the raw flight log so the thresholds can be revisited.");
  }
  return ["## Next steps", "", ...steps.map((step, index) => `${index + 1}. ${step}`)].join("\n");
}

function findCulpritJoin(records: FlightRecord[], analysis: SessionAnalysis): Culprit | undefined {
  const bySeq = new Map(records.map((record) => [record.seq, record]));
  const gun = analysis.smokingGun;

  // An in-flight data call points back at the join that produced its handle.
  if (gun) {
    const beginRecord = bySeq.get(gun.seq);
    if (beginRecord?.def) {
      return { seq: gun.seq, type: gun.op, def: beginRecord.def as Record<string, unknown> };
    }
    const joinSeq = beginRecord?.joinSeq as number | undefined;
    const join = joinSeq === undefined ? undefined : bySeq.get(joinSeq);
    if (join?.def) {
      return { seq: join.seq, type: opName(join.type), def: join.def as Record<string, unknown> };
    }
  }
  // Otherwise the most recent join carrying a structural finding.
  const flagged = records.findLast(
    (record) => record.def && (record.findings as unknown[] | undefined)?.length,
  );
  const fallback = flagged ?? records.findLast((record) => record.def);
  return fallback
    ? {
        seq: fallback.seq,
        type: opName(fallback.type),
        def: fallback.def as Record<string, unknown>,
      }
    : undefined;
}

function opName(recordType: string): string {
  return recordType.replace(/-(begin|end|error)$/, "");
}

function sparkline(series: { wall: number; rss?: number }[], width = 72): string {
  if (series.length === 0) return "(no samples)";
  const values = series.map((sample) => sample.rss ?? 0);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const chars = "▁▂▃▄▅▆▇█";
  const step = Math.max(1, Math.ceil(values.length / width));
  let line = "";
  for (let i = 0; i < values.length; i += step) {
    const bucket = values.slice(i, i + step);
    const peak = Math.max(...bucket);
    const index = max === min ? 0 : Math.round(((peak - min) / (max - min)) * (chars.length - 1));
    line += chars[index];
  }
  const spanMs = (series[series.length - 1].wall ?? 0) - (series[0].wall ?? 0);
  return `${line}\n${formatBytes(min)} → ${formatBytes(max)} over ${(spanMs / 1000).toFixed(1)}s (${
    values.length
  } samples)`;
}

function table(title: string, rows: string[]): string {
  return [`## ${title}`, "", "| | |", "| --- | --- |", ...rows].join("\n");
}

function row(key: string, value: unknown): string {
  return `| ${key} | ${value ?? "unknown"} |`;
}

function escapeCell(value: string): string {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
}
