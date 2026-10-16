/*
  Recorded outputs. A block's test records the columns one of its runs exported into a folder
  under its test package: `manifest.json` with every column's PColumnSpec, and `data.tsv`
  with the outer join of the columns on their axes. The folder is two things at once: the
  producer's golden test (`expectRecording`) and a consumer's upstream fixture
  (`recordedDataset`), publishable through xsv-import without running the producer.

  One TSV over the union of the axes: every column of a block has to come from one publisher
  (a consumer's workflow resolves only the blocks its args reference), and xsv-import's
  `parentAxes` grouping takes exactly this layout. Each axis carries `filterOutRegex: "^$"`,
  so a column keyed on some axes skips the rows that lack them.

  An empty TSV cell is NA, so an empty string is recorded as NA: TSV cannot tell them apart.
*/

import type { AxisSpec, PColumnSpec, PObjectId } from "@platforma-sdk/model";
import { getAxisId, getPColumnSpecId } from "@platforma-sdk/model";
import * as fsp from "node:fs/promises";
import path from "node:path";
import type { DatasetShape, PublishableDataset, ShapeColumn, ShapeRow } from "./fixtures/dataset";
import { shapeSpec } from "./fixtures/dataset";
import type { XsvAxis, XsvValueType } from "./fixtures/xsv-spec";
import { renderTsv } from "./fixtures/xsv-spec";
import type { ColumnRow, ListedColumn } from "./pframe-read";

export const RECORDING_VERSION = 1;

export type RecordingAxis = { column: string; spec: AxisSpec };

export type RecordingColumn = {
  /** File column in `data.tsv`. */
  column: string;
  spec: PColumnSpec;
  /** Indexes into the recording's axes, in the column's own axis order. */
  parentAxes: number[];
  rows: number;
};

export type RecordingManifest = {
  version: typeof RECORDING_VERSION;
  scenario: string;
  /** Who produced it; informational, written by the recorder when given. */
  producer?: { block?: string; version?: string };
  axes: RecordingAxis[];
  columns: RecordingColumn[];
};

export type Recording = RecordingManifest & {
  /** Joined rows keyed by file column; a missing cell is undefined. */
  rows: ShapeRow[];
};

export const MANIFEST_FILE = "manifest.json";
export const DATA_FILE = "data.tsv";

/** An axis's identity (name, type, domain, context domain), independent of key order. */
const axisKey = (a: AxisSpec) => canonicalJson(getAxisId(a));

const sanitize = (s: string) => s.replace(/\W+/g, "_");

/**
 * File column for a pool name. Two columns of one name are told apart by the domain values
 * the later one has and the earlier does not, then by a counter.
 */
function fileColumnName(
  name: string,
  domain: Record<string, string> | undefined,
  taken: Map<string, Record<string, string> | undefined>,
): string {
  const base = sanitize(name.split("/").pop() || name);
  if (!taken.has(base)) {
    taken.set(base, domain);
    return base;
  }
  const first = taken.get(base) ?? {};
  const own = Object.entries(domain ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .filter(([k, v]) => first[k] !== v)
    .map(([, v]) => sanitize(v));
  let candidate = own.length > 0 ? `${base}_${own.join("_")}` : base;
  for (let i = 2; taken.has(candidate); i++) candidate = `${base}_${i}`;
  taken.set(candidate, domain);
  return candidate;
}

/** A stable order for columns: by name, then domain, then axes. */
const columnOrder = (a: ListedColumn, b: ListedColumn) =>
  a.spec.name.localeCompare(b.spec.name) ||
  canonicalJson(a.spec.domain ?? {}).localeCompare(canonicalJson(b.spec.domain ?? {})) ||
  canonicalJson(a.spec.axesSpec).localeCompare(canonicalJson(b.spec.axesSpec));

/** A column's full identity, independent of key order. */
const columnKey = (spec: PColumnSpec) => canonicalJson(getPColumnSpecId(spec));

export type RecordOptions = {
  scenario: string;
  producer?: RecordingManifest["producer"];
  /** Columns to record; the source's columns when omitted. */
  columns?: ListedColumn[];
  /** Leave out columns the predicate matches (large per-row payloads, for instance). */
  exclude?: (spec: PColumnSpec) => boolean;
  /**
   * The producing block's id, replaced by `{{blockId}}` wherever a domain or annotation
   * carries it, so two runs of one scenario record the same specs.
   */
  blockId?: string;
  /** Other run-specific values to replace, value to token. */
  redact?: Record<string, string>;
};

/** What the recorder reads: a `PFrameReader`, or anything with the same members. */
export type ColumnSource = {
  columns: ListedColumn[];
  readById(columnId: PObjectId): Promise<ColumnRow[]>;
};

export const BLOCK_ID_TOKEN = "{{blockId}}";

function replaceValues<T>(value: T, replacements: [string, string][]): T {
  if (typeof value === "string") {
    let out: string = value;
    for (const [from, to] of replacements) out = out.split(from).join(to);
    return out as T;
  }
  if (Array.isArray(value)) return value.map((v) => replaceValues(v, replacements)) as T;
  if (typeof value === "object" && value !== null)
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, replaceValues(v, replacements)]),
    ) as T;
  return value;
}

/** JSON with object keys sorted at every depth, so equal values print equal. */
export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : typeof v === "object" && v !== null
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, sort(x)]),
          )
        : v;
  return JSON.stringify(sort(value));
}

/**
 * Annotations holding JSON (`pl7.app/trace`, for one) are re-serialized with sorted keys:
 * a block that builds them from a map prints keys in varying order across runs.
 */
function canonicalizeAnnotations<T extends AxisSpec | PColumnSpec>(spec: T): T {
  const annotations = Object.fromEntries(
    Object.entries(spec.annotations ?? {}).map(([k, v]) => {
      if (typeof v !== "string" || !/^[[{]/.test(v)) return [k, v];
      try {
        return [k, canonicalJson(JSON.parse(v))];
      } catch {
        return [k, v];
      }
    }),
  );
  const out = spec.annotations === undefined ? { ...spec } : { ...spec, annotations };
  return (
    "axesSpec" in out
      ? { ...out, axesSpec: out.axesSpec.map((a: AxisSpec) => canonicalizeAnnotations(a)) }
      : out
  ) as T;
}

/** A spec with run-specific values replaced by tokens (or tokens by values). */
export function tokenizeSpec<T extends AxisSpec | PColumnSpec>(
  spec: T,
  replacements: [string, string][],
): T {
  if (replacements.length === 0) return spec;
  // Names and types never carry a run id; domains and annotations of the column and of
  // its axes do, so the whole spec is walked.
  return replaceValues(spec, replacements);
}

/**
 * Record the source's columns as one table: the union of their axes, and one row per
 * distinct axis tuple. A column keyed on some of the axes fills every row that carries its
 * key, and gets a row of its own only when none does.
 */
export async function recordColumns(source: ColumnSource, opts: RecordOptions): Promise<Recording> {
  const replacements: [string, string][] = [
    ...(opts.blockId === undefined ? [] : [[opts.blockId, BLOCK_ID_TOKEN] as [string, string]]),
    ...Object.entries(opts.redact ?? {}),
  ];
  const columns = (opts.columns ?? source.columns)
    .filter((c) => !opts.exclude?.(c.spec))
    .map((c) => ({ ...c, spec: canonicalizeAnnotations(tokenizeSpec(c.spec, replacements)) }))
    .sort(columnOrder);
  if (columns.length === 0) throw new Error(`Nothing to record for ${opts.scenario}`);

  // Union of axes; the first column to mention an axis fixes its position.
  const axes: RecordingAxis[] = [];
  const axisIndex = new Map<string, number>();
  const taken = new Map<string, Record<string, string> | undefined>();
  for (const { spec } of columns) {
    for (const a of spec.axesSpec) {
      const k = axisKey(a);
      if (!axisIndex.has(k)) {
        axisIndex.set(k, axes.length);
        axes.push({ column: fileColumnName(a.name, a.domain, taken), spec: a });
      }
    }
  }
  const plan = columns.map((col) => ({
    col,
    column: fileColumnName(col.spec.name, col.spec.domain, taken),
    parentAxes: col.spec.axesSpec.map((a) => axisIndex.get(axisKey(a))!),
  }));

  // Widest columns first, so narrower ones find rows to fill.
  const order = [...plan].sort((a, b) => b.parentAxes.length - a.parentAxes.length);
  const rows: ShapeRow[] = [];
  const subKey = (row: ShapeRow, parentAxes: number[]) =>
    parentAxes.map((i) => String(row[axes[i].column] ?? "")).join("\u0000");
  const recorded = new Map<string, RecordingColumn>();
  for (const { col, column, parentAxes } of order) {
    const index = new Map<string, ShapeRow[]>();
    for (const row of rows) {
      if (!parentAxes.every((i) => row[axes[i].column] !== undefined)) continue;
      const k = subKey(row, parentAxes);
      const bucket = index.get(k);
      if (bucket === undefined) index.set(k, [row]);
      else bucket.push(row);
    }
    const data = await source.readById(col.columnId);
    recorded.set(column, { column, spec: col.spec, parentAxes, rows: data.length });
    for (const { keys, value } of data) {
      const cells: ShapeRow = {};
      parentAxes.forEach((axisIdx, i) => {
        cells[axes[axisIdx].column] = keys[i];
      });
      const v = value === null || value === "" ? undefined : value;
      const k = subKey(cells, parentAxes);
      const hits = index.get(k);
      if (hits !== undefined) for (const row of hits) row[column] = v;
      else {
        const row = { ...cells, [column]: v };
        rows.push(row);
        index.set(k, [row]);
      }
    }
  }

  const fullKey = (row: ShapeRow) => axes.map((a) => String(row[a.column] ?? "")).join("\u0000");
  rows.sort((a, b) => fullKey(a).localeCompare(fullKey(b)));
  return {
    version: RECORDING_VERSION,
    scenario: opts.scenario,
    producer: opts.producer,
    axes,
    columns: plan.map((p) => recorded.get(p.column)!),
    rows,
  };
}

/**
 * Write both files of a recording. Both are rendered and staged before either replaces the
 * saved one, so a value TSV cannot hold leaves the saved recording as it was.
 */
export async function writeRecording(dir: string, rec: Recording): Promise<void> {
  const { rows, ...manifest } = rec;
  const header = [...rec.axes.map((a) => a.column), ...rec.columns.map((c) => c.column)];
  const files: [string, string][] = [
    [MANIFEST_FILE, JSON.stringify(manifest, null, 2) + "\n"],
    [DATA_FILE, renderTsv(header, rows)],
  ];
  await fsp.mkdir(dir, { recursive: true });
  for (const [name, content] of files) await fsp.writeFile(path.join(dir, `${name}.tmp`), content);
  for (const [name] of files) await fsp.rename(path.join(dir, `${name}.tmp`), path.join(dir, name));
}

export async function readRecording(dir: string): Promise<Recording> {
  const manifest = JSON.parse(
    await fsp.readFile(path.join(dir, MANIFEST_FILE), "utf8"),
  ) as RecordingManifest;
  if (manifest.version !== RECORDING_VERSION)
    throw new Error(
      `Recording ${dir} has version ${manifest.version}, expected ${RECORDING_VERSION}`,
    );
  const tsv = await fsp.readFile(path.join(dir, DATA_FILE), "utf8");
  const [header, ...lines] = tsv.split("\n").filter((l) => l.length > 0);
  const names = header.split("\t");
  const numeric = new Set(
    manifest.columns.filter((c) => c.spec.valueType !== "String").map((c) => c.column),
  );
  for (const a of manifest.axes) if (a.spec.type !== "String") numeric.add(a.column);
  const rows: ShapeRow[] = lines.map((line) => {
    const cells = line.split("\t");
    const row: ShapeRow = {};
    names.forEach((n, i) => {
      const v = cells[i] ?? "";
      if (v === "") return;
      row[n] = numeric.has(n) ? Number(v) : v;
    });
    return row;
  });
  return { ...manifest, rows };
}

export type DiffOptions = {
  /** Absolute tolerance per file column for numeric values. */
  tolerance?: Record<string, number>;
  /** Examples to list per kind of change. */
  examples?: number;
};

/** Differences between two recordings, one line each; empty when they match. */
export function diffRecordings(
  expected: Recording,
  actual: Recording,
  opts: DiffOptions = {},
): string[] {
  const out: string[] = [];
  const examples = opts.examples ?? 5;
  const byName = (cs: RecordingColumn[]) => new Map(cs.map((c) => [c.column, c]));
  const exp = byName(expected.columns);
  const act = byName(actual.columns);
  for (const name of exp.keys())
    if (!act.has(name)) out.push(`column ${name}: missing from the run`);
  for (const name of act.keys()) if (!exp.has(name)) out.push(`column ${name}: new in the run`);
  const axesChanged =
    canonicalJson(expected.axes.map((a) => a.spec)) !==
    canonicalJson(actual.axes.map((a) => a.spec));
  if (axesChanged) out.push("axes: changed");

  // JSON keeps axis tuples apart that a joined string would merge (`a|b`,`c` vs `a`,`b|c`).
  const keyOf = (row: ShapeRow, c: RecordingColumn, rec: Recording) =>
    JSON.stringify(c.parentAxes.map((i) => String(row[rec.axes[i].column] ?? "")));
  const shown = (k: string) => (JSON.parse(k) as string[]).join("|");
  for (const [name, e] of exp) {
    const a = act.get(name);
    if (a === undefined) continue;
    if (canonicalJson(e.spec) !== canonicalJson(a.spec)) {
      out.push(
        `column ${name}: spec changed\n  expected ${JSON.stringify(e.spec)}\n  actual   ${JSON.stringify(a.spec)}`,
      );
    }
    // The joined table cannot tell a dropped row from an NA one where another column keeps
    // the row; the column's own row count can.
    if (e.rows !== a.rows) out.push(`column ${name}: ${e.rows} rows -> ${a.rows}`);
    if (axesChanged) continue;
    const values = (rec: Recording, c: RecordingColumn) => {
      const m = new Map<string, string | number | undefined>();
      for (const row of rec.rows) {
        if (!c.parentAxes.every((i) => row[rec.axes[i].column] !== undefined)) continue;
        const k = keyOf(row, c, rec);
        if (!m.has(k) || m.get(k) === undefined) m.set(k, row[name]);
      }
      return m;
    };
    const ev = values(expected, e);
    const av = values(actual, a);
    const tol = opts.tolerance?.[name] ?? 0;
    const missing: string[] = [];
    const added: string[] = [];
    const changed: string[] = [];
    for (const [k, v] of ev) {
      if (!av.has(k)) missing.push(shown(k));
      else {
        const w = av.get(k);
        const same =
          Object.is(v, w) ||
          v === w ||
          (typeof v === "number" &&
            typeof w === "number" &&
            Number.isFinite(v) &&
            Number.isFinite(w) &&
            Math.abs(v - w) <= tol);
        if (!same) changed.push(`${shown(k)}: ${String(v)} -> ${String(w)}`);
      }
    }
    for (const k of av.keys()) if (!ev.has(k)) added.push(shown(k));
    const report = (what: string, items: string[]) => {
      if (items.length === 0) return;
      out.push(
        `column ${name}: ${items.length} ${what}: ${items.slice(0, examples).join("; ")}${items.length > examples ? "; ..." : ""}`,
      );
    };
    report("rows missing", missing);
    report("rows added", added);
    report("values changed", changed);
  }
  return out;
}

export type ExpectRecordingOptions = RecordOptions &
  DiffOptions & {
    /** Folder of the recording; `<recordingsRoot>/<scenario>` when omitted. */
    dir?: string;
    /** Root for recordings; `assets/recordings` under the current directory by default. */
    recordingsRoot?: string;
    /** Rewrite the recording instead of comparing; `UPDATE_RECORDINGS=1` sets it. */
    update?: boolean;
    /** Let an update drop columns the recording had. */
    allowDroppedColumns?: boolean;
  };

/**
 * Compare the source's columns to the committed recording and throw with the differences.
 * With `UPDATE_RECORDINGS=1` (or `update`), write the recording instead; dropping a column
 * the recording had still throws unless `allowDroppedColumns` is set.
 */
export async function expectRecording(
  source: ColumnSource,
  opts: ExpectRecordingOptions,
): Promise<Recording> {
  const dir =
    opts.dir ?? path.join(opts.recordingsRoot ?? path.resolve("assets/recordings"), opts.scenario);
  const update = opts.update ?? process.env.UPDATE_RECORDINGS === "1";
  const actual = await recordColumns(source, opts);
  let expected: Recording | undefined;
  try {
    expected = await readRecording(dir);
  } catch (e) {
    if (!(e instanceof Error && "code" in e && e.code === "ENOENT")) throw e;
  }
  if (update) {
    if (expected !== undefined && !opts.allowDroppedColumns) {
      // By identity, not file column: adding a same-name column renames the existing one.
      const have = new Set(actual.columns.map((c) => columnKey(c.spec)));
      const dropped = expected.columns
        .filter((c) => !have.has(columnKey(c.spec)))
        .map((c) => c.column);
      if (dropped.length > 0)
        throw new Error(
          `Updating ${dir} would drop columns ${dropped.join(", ")}; pass allowDroppedColumns to confirm`,
        );
    }
    await writeRecording(dir, actual);
    return actual;
  }
  if (expected === undefined)
    throw new Error(`No recording at ${dir}; run with UPDATE_RECORDINGS=1 to create it`);
  const diff = diffRecordings(expected, actual, opts);
  if (diff.length > 0)
    throw new Error(
      `Recording ${opts.scenario} differs from the run (UPDATE_RECORDINGS=1 to accept):\n${diff.join("\n")}`,
    );
  return actual;
}

export type RecordedDatasetOptions = {
  /** What `{{blockId}}` becomes in the published specs; a fixed id by default. */
  blockId?: string;
  /** Domain values to rewrite in every axis and column, old value to new. */
  domainRewrites?: Record<string, string>;
};

export const RECORDED_BLOCK_ID = "recorded-upstream";

const XSV_VALUE_TYPES: readonly string[] = [
  "Int",
  "Long",
  "Float",
  "Double",
  "String",
] satisfies XsvValueType[];

/** A recorded value type as xsv-import takes it; throws on one it cannot import. */
function xsvValueType(type: string): XsvValueType {
  if (!XSV_VALUE_TYPES.includes(type))
    throw new Error(`xsv-import cannot publish a ${type} column or axis`);
  return type as XsvValueType;
}

/** The shape a recording publishes as: its axes and columns, with the same identities. */
export function recordingShape(
  rec: RecordingManifest,
  opts: RecordedDatasetOptions = {},
): DatasetShape {
  const fill: [string, string][] = [[BLOCK_ID_TOKEN, opts.blockId ?? RECORDED_BLOCK_ID]];
  const rewrite = (d?: Record<string, string>) =>
    d === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(replaceValues(d, fill)).map(([k, v]) => [
            k,
            opts.domainRewrites?.[v] ?? v,
          ]),
        );
  const unsupported = [
    ...rec.axes
      .filter((a) => a.spec.contextDomain !== undefined || a.spec.parentAxes !== undefined)
      .map((a) => `axis ${a.column}`),
    ...rec.columns
      .filter((c) => c.spec.contextDomain !== undefined)
      .map((c) => `column ${c.column}`),
  ];
  // xsv-import has no context domain, and reads an axis's parentAxes against each column
  // group's own axes; publishing without them would change the column identities.
  if (unsupported.length > 0)
    throw new Error(
      `Recording carries contextDomain or axis parentAxes, which xsv-import cannot publish: ${unsupported.join(", ")}`,
    );
  const axes: XsvAxis[] = rec.axes.map((a) => ({
    column: a.column,
    filterOutRegex: "^$",
    spec: {
      name: a.spec.name,
      type: xsvValueType(a.spec.type),
      domain: rewrite(a.spec.domain),
      annotations: replaceValues(a.spec.annotations, fill),
    },
  }));
  const columns: ShapeColumn[] = rec.columns.map((c) => ({
    column: c.column,
    spec: {
      name: c.spec.name,
      valueType: xsvValueType(c.spec.valueType),
      parentAxes: c.parentAxes,
      domain: rewrite(c.spec.domain),
      annotations: replaceValues(c.spec.annotations, fill),
    },
  }));
  return { axes, columns, partitionKeyLength: 0 };
}

/**
 * A recording as a dataset `publishXsv` takes. Its columns are reachable afterwards as
 * `exportedRef(blockId, "outputPf", <file column>)`, file columns as the manifest lists them.
 */
export async function recordedDataset(
  dir: string,
  opts: RecordedDatasetOptions = {},
): Promise<PublishableDataset & { recording: Recording; shape: DatasetShape }> {
  const recording = await readRecording(dir);
  const shape = recordingShape(recording, opts);
  const header = [...shape.axes.map((a) => a.column), ...shape.columns.map((c) => c.column)];
  return { spec: shapeSpec(shape), content: renderTsv(header, recording.rows), recording, shape };
}
