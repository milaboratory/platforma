import {
  pTableValue,
  type CalculateTableDataRequest,
  type FullPTableColumnData,
  type PFrameHandle,
  type PObjectId,
} from "@milaboratories/pl-model-common";
import type { ColumnValueOption, ColumnValueOptionsModel } from "../columns";
import { deriveColumnValueOptions, deriveLabelledColumnValueOptions } from "../columns";

/** A model whose value column is there to read. */
export type PresentColumnValueOptionsModel = Extract<ColumnValueOptionsModel, { type: "present" }>;

/**
 * The options of a value picker, read in the UI through the frame of `model` (see
 * `deriveColumnValueOptions` and `deriveLabelledColumnValueOptions`). Missing values are not
 * offered; a value with a missing label labels itself. Rejects when the value column has more
 * distinct values than a picker can offer, or, with a label column, more rows than it reads.
 */
export async function readColumnValueOptions(
  model: PresentColumnValueOptionsModel,
): Promise<ColumnValueOption[]> {
  const { value, label } = model.frameColumns;
  if (label === null) {
    return deriveColumnValueOptions(
      model.valueColumn,
      await readDistinctValues(model.frame, value),
    );
  }
  return deriveLabelledColumnValueOptions(
    model.valueColumn,
    await readLabelledValues(model.frame, { value, label }),
  );
}

// Internals

/** More distinct values than any picker can usefully list. */
const VALUES_LIMIT = 100_000;

async function readDistinctValues(frame: PFrameHandle, column: PObjectId): Promise<string[]> {
  const response = await frameDriver().getUniqueValues(frame, {
    columnId: column,
    filters: [],
    limit: VALUES_LIMIT,
  });
  if (response.overflow) {
    throw new Error(`The column has more than ${VALUES_LIMIT} distinct values`);
  }

  const values: string[] = [];
  for (let row = 0; row < response.values.data.length; row++) {
    const value = pTableValue(response.values, row, { na: null });
    if (value !== null) values.push(String(value));
  }
  return values;
}

/**
 * Every row of the value column with the label the label column holds at the same keys, or an
 * empty label where it holds none. Rows without a value are left out.
 */
async function readLabelledValues(
  frame: PFrameHandle,
  columns: { readonly value: PObjectId; readonly label: PObjectId },
): Promise<{ value: string; label: string }[]> {
  const request: CalculateTableDataRequest<PObjectId> = {
    src: {
      type: "outer",
      primary: { type: "column", column: columns.value },
      secondary: [{ type: "column", column: columns.label }],
    },
    filters: [],
    sorting: [],
  };
  // One row past the limit tells a column that has more rows than a picker reads.
  const response = await frameDriver().calculateTableData(frame, request, {
    offset: 0,
    length: VALUES_LIMIT + 1,
  });
  const values = columnData(response, columns.value);
  const labels = columnData(response, columns.label);
  if (values.data.length > VALUES_LIMIT) {
    throw new Error(`The column has more than ${VALUES_LIMIT} rows`);
  }

  const rows: { value: string; label: string }[] = [];
  for (let row = 0; row < values.data.length; row++) {
    const value = pTableValue(values, row, { na: null });
    if (value === null) continue;
    const label = pTableValue(labels, row, { na: null });
    rows.push({ value: String(value), label: label === null ? "" : String(label) });
  }
  return rows;
}

function columnData(
  response: readonly FullPTableColumnData[],
  column: PObjectId,
): FullPTableColumnData["data"] {
  const entry = response.find((item) => item.spec.type === "column" && item.spec.id === column);
  if (entry === undefined) throw new Error(`The frame did not return column ${column}`);
  return entry.data;
}

function frameDriver() {
  if (typeof platforma === "undefined" || platforma.pFrameDriver === undefined) {
    throw new Error("The frame driver is not available");
  }
  return platforma.pFrameDriver;
}
