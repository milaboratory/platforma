import type { PTableKey, PTableVector } from "@platforma-sdk/model";
import { canonicalizeJson, pTableValue } from "@platforma-sdk/model";
import type { PlAgDataTableV2Row, PlTableRowId } from "../../PlAgDataTable/types";
import { PTableHidden } from "../../PlAgDataTable/sources/common";

/**
 * Converts columnar data from the driver into row objects consumed by ag-grid.
 */
export function columnsToRows(
  fields: number[],
  columns: PTableVector[],
  fieldResultMapping: number[],
  axesResultIndices: number[],
): PlAgDataTableV2Row[] {
  const rowData: PlAgDataTableV2Row[] = [];
  for (let iRow = 0; iRow < columns[0].data.length; ++iRow) {
    const axesKey: PTableKey = axesResultIndices.map((ri) => pTableValue(columns[ri], iRow));
    const id = canonicalizeJson<PlTableRowId>(axesKey);
    const row = fields.reduce<PlAgDataTableV2Row>(
      (acc, field, iCol) => {
        acc[field.toString() as `${number}`] =
          fieldResultMapping[iCol] === -1
            ? PTableHidden
            : pTableValue(columns[fieldResultMapping[iCol]], iRow);
        return acc;
      },
      { id, axesKey },
    );

    rowData.push(row);
  }
  return rowData;
}
