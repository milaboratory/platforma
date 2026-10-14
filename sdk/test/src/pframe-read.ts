import type { MiddleLayer } from "@milaboratories/pl-middle-layer";
import type { PColumnSpec, PFrameHandle, PObjectId } from "@platforma-sdk/model";

export type PFrameDriver = MiddleLayer["driverKit"]["pFrameDriver"];

export type ListedColumn = { columnId: PObjectId; spec: PColumnSpec };

export type ColumnQuery = {
  name: string;
  /** Axis names, in order. */
  axes?: string[];
  /** Domain entries that must be present with these values. */
  domain?: Record<string, string>;
};

export type ColumnRow = { keys: string[]; value: string | number | null };

/**
 * Columns of a PFrame that the owning block produced itself. A block's PFrame outputs
 * often carry every pool column the block can see (its inputs, sibling blocks' exports);
 * the block's own columns are the ones with local-form ids, which carry `resolvePath`.
 */
export async function listLocalColumns(
  driver: PFrameDriver,
  pf: PFrameHandle,
): Promise<ListedColumn[]> {
  return (await driver.listColumns(pf)).filter((c) => {
    try {
      return (JSON.parse(c.columnId) as { resolvePath?: unknown }).resolvePath !== undefined;
    } catch {
      return false;
    }
  });
}

export function findColumns(columns: ListedColumn[], q: ColumnQuery): ListedColumn[] {
  return columns.filter(({ spec }) => {
    if (spec.name !== q.name) return false;
    if (q.axes && JSON.stringify(spec.axesSpec.map((a) => a.name)) !== JSON.stringify(q.axes))
      return false;
    if (q.domain && Object.entries(q.domain).some(([k, v]) => spec.domain?.[k] !== v)) return false;
    return true;
  });
}

/** The one column matching `q`; throws listing every column when zero or several match. */
export function findColumn(columns: ListedColumn[], q: ColumnQuery): ListedColumn {
  const hits = findColumns(columns, q);
  if (hits.length !== 1) {
    const seen = columns.map(
      (c) => `${c.spec.name} [${c.spec.axesSpec.map((a) => a.name).join(", ")}]`,
    );
    throw new Error(
      `Expected one column for ${JSON.stringify(q)}, found ${hits.length}. Columns: ${seen.join("; ")}`,
    );
  }
  return hits[0];
}

/** Rows of one column as `[axisKeys..., value]`, NA as null. Row order is not meaningful. */
export async function readColumnById(
  driver: PFrameDriver,
  pf: PFrameHandle,
  columnId: PObjectId,
): Promise<ColumnRow[]> {
  const table = await driver.calculateTableData(pf, {
    src: { type: "column", column: columnId },
    filters: [],
    sorting: [],
  });
  const axes = table.filter((c) => c.spec.type === "axis");
  const col = table.find((c) => c.spec.type === "column");
  if (col === undefined) throw new Error("Column data missing from table response");
  const n = col.data.data.length;
  const isNA = (v: { isNA?: Uint8Array }, i: number) =>
    v.isNA !== undefined && (v.isNA[Math.floor(i / 8)] & (1 << (7 - (i % 8)))) !== 0;
  const rows: ColumnRow[] = [];
  for (let i = 0; i < n; i++) {
    const keys = axes.map((a) => String(a.data.data[i]));
    const raw = col.data.data[i];
    const value = isNA(col.data, i)
      ? null
      : typeof raw === "bigint"
        ? Number(raw)
        : (raw as string | number);
    rows.push({ keys, value });
  }
  return rows;
}

export async function readColumn(
  driver: PFrameDriver,
  pf: PFrameHandle,
  columns: ListedColumn[],
  q: ColumnQuery,
): Promise<ColumnRow[]> {
  return await readColumnById(driver, pf, findColumn(columns, q).columnId);
}

/** Map of a column keyed by its last axis: axis key → value. */
export async function readColumnMap(
  driver: PFrameDriver,
  pf: PFrameHandle,
  columns: ListedColumn[],
  q: ColumnQuery,
): Promise<Map<string, string | number | null>> {
  const rows = await readColumn(driver, pf, columns, q);
  return new Map(rows.map((r) => [r.keys[r.keys.length - 1], r.value]));
}

/** Readers bound to one PFrame, for tests that read many columns of one output. */
export class PFrameReader {
  constructor(
    readonly driver: PFrameDriver,
    readonly pf: PFrameHandle,
    readonly columns: ListedColumn[],
  ) {}

  /** Bind to the block's own columns of `pf` (see `listLocalColumns`). */
  static async local(driver: PFrameDriver, pf: PFrameHandle): Promise<PFrameReader> {
    return new PFrameReader(driver, pf, await listLocalColumns(driver, pf));
  }

  /** Bind to every column of `pf`. */
  static async all(driver: PFrameDriver, pf: PFrameHandle): Promise<PFrameReader> {
    return new PFrameReader(driver, pf, await driver.listColumns(pf));
  }

  findColumns(q: ColumnQuery): ListedColumn[] {
    return findColumns(this.columns, q);
  }

  findColumn(q: ColumnQuery): ListedColumn {
    return findColumn(this.columns, q);
  }

  read(q: ColumnQuery): Promise<ColumnRow[]> {
    return readColumn(this.driver, this.pf, this.columns, q);
  }

  readById(columnId: PObjectId): Promise<ColumnRow[]> {
    return readColumnById(this.driver, this.pf, columnId);
  }

  readMap(q: ColumnQuery): Promise<Map<string, string | number | null>> {
    return readColumnMap(this.driver, this.pf, this.columns, q);
  }
}
