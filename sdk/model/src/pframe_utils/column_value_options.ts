import { pTableValue } from "@milaboratories/pl-model-common";
import type { ColumnValueOption, ColumnValuesSource } from "../columns";
import { deriveColumnValueOptions } from "../columns";
import { PFrameImpl } from "../pframe";

/** A source whose column is there to read. */
export type PresentColumnValuesSource = Extract<ColumnValuesSource, { type: "present" }>;

/**
 * The distinct values of the column `source` holds, read in the UI through its frame, as options
 * of a value picker (see `deriveColumnValueOptions`). Missing values are not offered. Rejects when
 * the frame does not hold exactly one column, or when the column has more distinct values than a
 * picker can offer.
 */
export async function readColumnValueOptions(
  source: PresentColumnValuesSource,
): Promise<ColumnValueOption[]> {
  const frame = new PFrameImpl(source.frame);
  const columns = await frame.listColumns();
  if (columns.length !== 1) {
    throw new Error(`A frame of one column expected, it holds ${columns.length}`);
  }
  const response = await frame.getUniqueValues({
    columnId: columns[0].columnId,
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
  return deriveColumnValueOptions(source.column, values);
}

// Internals

/** More distinct values than any picker can usefully list. */
const VALUES_LIMIT = 100_000;
