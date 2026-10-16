/*
  Recorded outputs. A block's test records the columns one of its runs exported into a folder
  under its test package: `manifest.json` with every column's PColumnSpec, and `data.tsv`
  with the outer join of the columns on their axes. The folder is two things at once: the
  producer's golden test (`expectRecording`, a file snapshot of both files) and a consumer's
  upstream fixture (`recordedDataset`), publishable through xsv-import without running the
  producer.

  One TSV over the union of the axes: every column of a block has to come from one publisher
  (a consumer's workflow resolves only the blocks its args reference), and xsv-import's
  `parentAxes` grouping takes exactly this layout. Each axis and each column carries
  `filterOutRegex: "^$"`, so a column keeps only the rows where its own cell is filled.

  An empty cell is NA: TSV cannot tell an empty string from a missing value.
*/

import type { AxisSpec, PColumnSpec, PObjectId } from "@platforma-sdk/model";
import { canonicalizeJson, getAxisId, getPColumnSpecId } from "@platforma-sdk/model";
import * as fsp from "node:fs/promises";
import path from "node:path";
import type { ExpectStatic } from "vitest";
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
export const BLOCK_ID_TOKEN = "{{blockId}}";
export const RECORDED_BLOCK_ID = "recorded-upstream";

/** Code-unit order: the same on every machine, unlike `localeCompare`. */
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** An axis's identity (name, type, domain, context domain), independent of key order. */
const axisKey = (a: AxisSpec) => canonicalizeJson(getAxisId(a));

/** A column's full identity, independent of key order. */
const columnKey = (spec: PColumnSpec) => canonicalizeJson(getPColumnSpecId(spec));

/** A total order on columns: by name, then by identity. */
const columnOrder = (a: ListedColumn, b: ListedColumn) =>
  byCodeUnit(a.spec.name, b.spec.name) || byCodeUnit(columnKey(a.spec), columnKey(b.spec));

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
    .sort(([a], [b]) => byCodeUnit(a, b))
    .filter(([k, v]) => first[k] !== v)
    .map(([, v]) => sanitize(v));
  let candidate = own.length > 0 ? `${base}_${own.join("_")}` : base;
  for (let i = 2; taken.has(candidate); i++) candidate = `${base}_${i}`;
  taken.set(candidate, domain);
  return candidate;
}

type Strings = Record<string, string>;

const mapValues = (r: Strings | undefined, f: (v: string) => string): Strings | undefined =>
  r === undefined ? undefined : Object.fromEntries(Object.entries(r).map(([k, v]) => [k, f(v)]));

/**
 * An annotation holding JSON (`pl7.app/trace`, for one) is re-serialized with sorted keys: a
 * block that builds it from a map prints keys in varying order across runs.
 */
function canonicalAnnotation(v: string): string {
  if (!/^[[{]/.test(v)) return v;
  try {
    return canonicalizeJson(JSON.parse(v));
  } catch {
    return v;
  }
}

/** An axis with `domain` applied to its domain values and `annotation` to its annotations. */
function mapAxis(a: AxisSpec, domain: (v: string) => string, annotation = domain): AxisSpec {
  return {
    ...a,
    domain: mapValues(a.domain, domain),
    contextDomain: mapValues(a.contextDomain, domain),
    annotations: mapValues(a.annotations, annotation),
  };
}

/** The same for a column and each of its axes. */
function mapColumn(
  c: PColumnSpec,
  domain: (v: string) => string,
  annotation = domain,
): PColumnSpec {
  return {
    ...c,
    domain: mapValues(c.domain, domain),
    contextDomain: mapValues(c.contextDomain, domain),
    annotations: mapValues(c.annotations, annotation),
    axesSpec: c.axesSpec.map((a) => mapAxis(a, domain, annotation)),
  };
}

export type RecordOptions = {
  scenario: string;
  producer?: RecordingManifest["producer"];
  /** Columns to record; the source's columns when omitted. */
  columns?: ListedColumn[];
  /**
   * The producing block's id, replaced by `{{blockId}}` wherever a domain or annotation
   * carries it, so two runs of one scenario record the same specs.
   */
  blockId?: string;
  /** Significant digits numeric values are rounded to, so float noise does not fail a run. */
  digits?: number;
};

/** What the recorder reads: a `PFrameReader`, or anything with the same members. */
export type ColumnSource = {
  columns: ListedColumn[];
  readById(columnId: PObjectId): Promise<ColumnRow[]>;
};

/**
 * Record the source's columns as one table: the union of their axes, and one row per
 * distinct axis tuple. A column keyed on some of the axes fills every row that carries its
 * key, and gets a row of its own only when none does.
 */
export async function recordColumns(source: ColumnSource, opts: RecordOptions): Promise<Recording> {
  const { blockId } = opts;
  const tokenize = (v: string) =>
    blockId === undefined ? v : v.split(blockId).join(BLOCK_ID_TOKEN);
  const columns = (opts.columns ?? source.columns)
    .map((c) => ({
      ...c,
      spec: mapColumn(c.spec, tokenize, (v) => canonicalAnnotation(tokenize(v))),
    }))
    .sort(columnOrder);
  if (columns.length === 0) throw new Error(`Nothing to record for ${opts.scenario}`);

  // Union of axes; the first column to mention an axis fixes its position. Axes are named
  // before columns, so an axis keeps its plain name.
  const axes: RecordingAxis[] = [];
  const axisIndex = new Map<string, number>();
  const taken = new Map<string, Record<string, string> | undefined>();
  const indexOf = (a: AxisSpec) => {
    const k = axisKey(a);
    let i = axisIndex.get(k);
    if (i === undefined) {
      i = axes.length;
      axisIndex.set(k, i);
      axes.push({ column: fileColumnName(a.name, a.domain, taken), spec: a });
    }
    return i;
  };
  const keyed = columns.map((col) => ({ col, parentAxes: col.spec.axesSpec.map(indexOf) }));
  const plan = keyed.map(({ col, parentAxes }) => ({
    col,
    recorded: {
      column: fileColumnName(col.spec.name, col.spec.domain, taken),
      spec: col.spec,
      parentAxes,
      rows: 0,
    } satisfies RecordingColumn,
  }));

  const round = (v: string | number) =>
    typeof v === "number" && opts.digits !== undefined ? Number(v.toPrecision(opts.digits)) : v;
  // JSON keeps axis tuples apart that a joined string would merge.
  const subKey = (row: ShapeRow, parentAxes: number[]) =>
    JSON.stringify(parentAxes.map((i) => String(row[axes[i].column] ?? "")));

  // Widest columns first, so narrower ones find rows to fill.
  const rows: ShapeRow[] = [];
  const widestFirst = [...plan].sort(
    (a, b) => b.recorded.parentAxes.length - a.recorded.parentAxes.length,
  );
  for (const { col, recorded } of widestFirst) {
    const { column, parentAxes } = recorded;
    const index = new Map<string, ShapeRow[]>();
    for (const row of rows) {
      if (!parentAxes.every((i) => row[axes[i].column] !== undefined)) continue;
      const k = subKey(row, parentAxes);
      const bucket = index.get(k);
      if (bucket === undefined) index.set(k, [row]);
      else bucket.push(row);
    }
    const data = await source.readById(col.columnId);
    recorded.rows = data.length;
    for (const { keys, value } of data) {
      const cells: ShapeRow = {};
      parentAxes.forEach((axisIdx, i) => {
        cells[axes[axisIdx].column] = keys[i];
      });
      const v = value === null ? undefined : round(value);
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

  const fullKey = (row: ShapeRow) => JSON.stringify(axes.map((a) => String(row[a.column] ?? "")));
  return {
    version: RECORDING_VERSION,
    scenario: opts.scenario,
    producer: opts.producer,
    axes,
    columns: plan.map((p) => p.recorded),
    rows: rows
      .map((row) => ({ row, key: fullKey(row) }))
      .sort((a, b) => byCodeUnit(a.key, b.key))
      .map(({ row }) => row),
  };
}

const header = (m: RecordingManifest) => [
  ...m.axes.map((a) => a.column),
  ...m.columns.map((c) => c.column),
];

/** The files of a recording, by file name. The manifest's keys are sorted at every depth. */
export function renderRecording(rec: Recording): Record<string, string> {
  const { rows, ...manifest } = rec;
  return {
    [MANIFEST_FILE]: JSON.stringify(JSON.parse(canonicalizeJson(manifest)), null, 2) + "\n",
    [DATA_FILE]: renderTsv(header(rec), rows),
  };
}

export type ExpectRecordingOptions = RecordOptions & {
  /** The test's `expect`. A concurrent test must pass its own context's. */
  expect: ExpectStatic;
  /** Folder of the recording; `<recordingsRoot>/<scenario>` when omitted. */
  dir?: string;
  /** Root for recordings; `assets/recordings` under the current directory by default. */
  recordingsRoot?: string;
};

/**
 * Snapshot the source's columns into the recording folder: both files are file snapshots,
 * so a run that differs fails with a line diff, and `vitest -u` rewrites them.
 */
export async function expectRecording(
  source: ColumnSource,
  opts: ExpectRecordingOptions,
): Promise<Recording> {
  const dir =
    opts.dir ?? path.join(opts.recordingsRoot ?? path.resolve("assets/recordings"), opts.scenario);
  const rec = await recordColumns(source, opts);
  await Promise.all(
    Object.entries(renderRecording(rec)).map(([name, text]) =>
      opts.expect(text).toMatchFileSnapshot(path.join(dir, name)),
    ),
  );
  return rec;
}

function parseManifest(text: string, dir: string): RecordingManifest {
  const manifest = JSON.parse(text) as RecordingManifest;
  if (manifest.version !== RECORDING_VERSION)
    throw new Error(
      `Recording ${dir} has version ${manifest.version}, expected ${RECORDING_VERSION}`,
    );
  return manifest;
}

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
    throw new Error(`xsv-import cannot publish a ${type} column`);
  return type as XsvValueType;
}

/** The shape a recording publishes as: its axes and columns, with the same identities. */
export function recordingShape(rec: RecordingManifest): DatasetShape {
  const unsupported = [
    ...rec.axes
      .filter((a) => a.spec.contextDomain !== undefined || a.spec.parentAxes !== undefined)
      .map((a) => `axis ${a.column}`),
    ...rec.columns
      .filter((c) => c.spec.contextDomain !== undefined || c.spec.parentAxes !== undefined)
      .map((c) => `column ${c.column}`),
  ];
  // xsv-import has no context domain, reads an axis's parentAxes against each column group's
  // own axes, and takes a column's parentAxes as its axis subset; publishing any of them
  // would change the column identities.
  if (unsupported.length > 0)
    throw new Error(
      `Recording carries contextDomain or parentAxes, which xsv-import cannot publish: ${unsupported.join(", ")}`,
    );
  const fill = (r?: Strings) =>
    mapValues(r, (v) => v.split(BLOCK_ID_TOKEN).join(RECORDED_BLOCK_ID));
  const axes: XsvAxis[] = rec.axes.map((a) => ({
    column: a.column,
    filterOutRegex: "^$",
    spec: {
      name: a.spec.name,
      type: a.spec.type,
      domain: fill(a.spec.domain),
      annotations: fill(a.spec.annotations),
    },
  }));
  // A column skips the rows where its cell is empty: those are rows of other columns, or NA,
  // and xsv-import would otherwise reject them (numbers) or import an empty string (text).
  const columns: ShapeColumn[] = rec.columns.map((c) => ({
    column: c.column,
    filterOutRegex: "^$",
    spec: {
      name: c.spec.name,
      valueType: xsvValueType(c.spec.valueType),
      parentAxes: c.parentAxes,
      domain: fill(c.spec.domain),
      annotations: fill(c.spec.annotations),
    },
  }));
  return { axes, columns, partitionKeyLength: 0 };
}

/**
 * A recording as a dataset `publishXsv` takes; `data.tsv` is published as it is. Its columns
 * are reachable afterwards as `exportedRef(blockId, "outputPf", <file column>)`, file
 * columns as the manifest lists them.
 */
export async function recordedDataset(
  dir: string,
): Promise<PublishableDataset & { recording: RecordingManifest; shape: DatasetShape }> {
  const recording = parseManifest(await fsp.readFile(path.join(dir, MANIFEST_FILE), "utf8"), dir);
  const content = await fsp.readFile(path.join(dir, DATA_FILE), "utf8");
  const expected = header(recording).join("\t");
  const actual = content.slice(0, content.indexOf("\n"));
  if (actual !== expected)
    throw new Error(
      `${path.join(dir, DATA_FILE)} has header ${JSON.stringify(actual)}, its manifest ${JSON.stringify(expected)}`,
    );
  const shape = recordingShape(recording);
  return { spec: shapeSpec(shape), content, recording, shape };
}
