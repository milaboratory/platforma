import type { MiddleLayer } from "@milaboratories/pl-middle-layer";
import type { PColumnSpec, PFrameHandle, PObjectId } from "@platforma-sdk/model";
import { pTableValue } from "@platforma-sdk/model";

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
 * An id that is not JSON means the id format changed, and throws rather than reading as
 * "no columns".
 */
export async function listLocalColumns(
  driver: PFrameDriver,
  pf: PFrameHandle,
): Promise<ListedColumn[]> {
  return (await driver.listColumns(pf)).filter((c) => {
    let id: unknown;
    try {
      id = JSON.parse(c.columnId);
    } catch (e) {
      throw new Error(`Column id is not JSON, cannot tell local columns: ${c.columnId}`, {
        cause: e,
      });
    }
    return typeof id === "object" && id !== null && "resolvePath" in id;
  });
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

  findColumns(q: ColumnQuery): ListedColumn[] {
    return this.columns.filter(({ spec }) => {
      if (spec.name !== q.name) return false;
      if (q.axes && JSON.stringify(spec.axesSpec.map((a) => a.name)) !== JSON.stringify(q.axes))
        return false;
      if (q.domain && Object.entries(q.domain).some(([k, v]) => spec.domain?.[k] !== v))
        return false;
      return true;
    });
  }

  /** The one column matching `q`; throws listing every column when zero or several match. */
  findColumn(q: ColumnQuery): ListedColumn {
    const hits = this.findColumns(q);
    if (hits.length !== 1) {
      const seen = this.columns.map(
        (c) => `${c.spec.name} [${c.spec.axesSpec.map((a) => a.name).join(", ")}]`,
      );
      throw new Error(
        `Expected one column for ${JSON.stringify(q)}, found ${hits.length}. Columns: ${seen.join("; ")}`,
      );
    }
    return hits[0];
  }

  read(q: ColumnQuery): Promise<ColumnRow[]> {
    return this.readById(this.findColumn(q).columnId);
  }

  /** Rows of one column as `[axisKeys..., value]`, NA as null. Row order is not meaningful. */
  async readById(columnId: PObjectId): Promise<ColumnRow[]> {
    const table = await this.driver.calculateTableData(this.pf, {
      src: { type: "column", column: columnId },
      filters: [],
      sorting: [],
    });
    const axes = table.filter((c) => c.spec.type === "axis");
    const col = table.find((c) => c.spec.type === "column");
    if (col === undefined) throw new Error("Column data missing from table response");
    const rows: ColumnRow[] = [];
    for (let i = 0; i < col.data.data.length; i++) {
      // Reads NA from the bitmap or, for older desktop versions, from the magic values.
      rows.push({ keys: axes.map((a) => String(a.data.data[i])), value: pTableValue(col.data, i) });
    }
    return rows;
  }

  /** Map of a column keyed by its last axis: axis key → value. Throws on a repeated key. */
  async readMap(q: ColumnQuery): Promise<Map<string, string | number | null>> {
    const result = new Map<string, string | number | null>();
    for (const row of await this.read(q)) {
      const key = row.keys[row.keys.length - 1];
      if (result.has(key))
        throw new Error(
          `Last-axis key ${JSON.stringify(key)} repeats in ${JSON.stringify(q)}; read rows instead`,
        );
      result.set(key, row.value);
    }
    return result;
  }
}
