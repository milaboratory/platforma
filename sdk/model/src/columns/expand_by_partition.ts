import type {
  AxisFilterByIdx,
  AxisFilterValue,
  AxisId,
  PartitionedDataInfoEntries,
  PColumn,
} from "@milaboratories/pl-model-common";
import {
  canonicalizeAxisId,
  entriesToDataInfo,
  getAxisId,
  isPartitionedDataInfoEntries,
} from "@milaboratories/pl-model-common";
import type { TreeNodeAccessor } from "../render/accessor";
import type { PColumnDataUniversal } from "../render/internal";
import { filterDataInfoEntries } from "../render/util/axis_filtering";
import { convertOrParsePColumnData, getUniquePartitionKeys } from "../render/util/pcolumn_data";

// --- Types ---

export interface SplitAxis {
  /** Index of the axis in the column's axesSpec to split by. */
  readonly idx: number;
}

export interface ExpandByPartitionOpts {
  /** Resolve axis values to human-readable labels. */
  axisLabels?: (axisId: AxisId) => undefined | Record<string | number, string>;
}

export interface ExpandByPartitionResult {
  /** Expanded columns (one per key combination per original column). */
  readonly items: PColumn<PColumnDataUniversal | undefined>[];
  /** False if any column's data was not ready for splitting. */
  readonly complete: boolean;
}

// --- Implementation ---

/**
 * Expand columns by splitting along partition axes.
 *
 * For each column, reads partition data, enumerates unique keys on the
 * split axes, and produces one output column per key combination —
 * with the split axes removed from `axesSpec` and a `pl7.app/trace`
 * annotation recording the split origin.
 *
 * Returns `{ items: [], complete: false }` when any column's data
 * is not ready (status !== 'ready' or partition data unavailable).
 */
export function expandByPartition(
  columns: PColumn<PColumnDataUniversal | undefined>[],
  splitAxes: SplitAxis[],
  opts?: ExpandByPartitionOpts,
): ExpandByPartitionResult {
  if (splitAxes.length === 0) {
    return { items: columns, complete: true };
  }

  const splitAxisIdxs = splitAxes.map((a) => a.idx).sort((a, b) => a - b);
  const result: PColumn<PColumnDataUniversal | undefined>[] = [];

  for (const column of columns) {
    if (column.dataStatus !== "ready" || column.data === undefined) {
      return { items: [], complete: false };
    }

    const dataEntries = convertOrParsePColumnData(column.data as TreeNodeAccessor | undefined);

    if (dataEntries === undefined) {
      return { items: [], complete: false };
    }

    if (!isPartitionedDataInfoEntries(dataEntries)) {
      throw new Error(
        `Splitting requires Partitioned DataInfoEntries, but got ${dataEntries.type} for column ${String(column.id)}`,
      );
    }

    const uniqueKeys = getUniquePartitionKeys(dataEntries);

    const maxSplitIdx = splitAxisIdxs[splitAxisIdxs.length - 1];
    if (maxSplitIdx >= dataEntries.partitionKeyLength) {
      throw new Error(
        `Not enough partition keys (${dataEntries.partitionKeyLength}) for requested split axes (max index ${maxSplitIdx}) in column ${column.spec.name}`,
      );
    }

    // Resolve labels for each split axis
    const axesLabels: (undefined | Record<string | number, string>)[] = splitAxisIdxs.map((idx) =>
      opts?.axisLabels?.(getAxisId(column.spec.axesSpec[idx])),
    );

    // Generate all key combinations across split axes
    const keyCombinations = generateKeyCombinations(uniqueKeys, splitAxisIdxs);
    if (keyCombinations.length === 0) continue;

    // Build adjusted axesSpec (remove split axes in reverse order)
    const newAxesSpec = [...column.spec.axesSpec];
    for (let i = splitAxisIdxs.length - 1; i >= 0; i--) {
      newAxesSpec.splice(splitAxisIdxs[i], 1);
    }

    for (const keyCombo of keyCombinations) {
      const axisFilters: AxisFilterByIdx[] = keyCombo.map(
        (value, sAxisIdx): AxisFilterByIdx => [splitAxisIdxs[sAxisIdx], value as AxisFilterValue],
      );

      const traceEntries = keyCombo.map((value, sAxisIdx) => {
        const axisIdx = splitAxisIdxs[sAxisIdx];
        const axisId = getAxisId(column.spec.axesSpec[axisIdx]);
        const labelMap = axesLabels[sAxisIdx];
        const label = labelMap?.[value] ?? String(value);
        return {
          type: `split:${canonicalizeAxisId(axisId)}`,
          label,
          importance: 1_000_000,
        };
      });

      const filteredData = filterDataInfoEntries(
        dataEntries as PartitionedDataInfoEntries<TreeNodeAccessor>,
        axisFilters,
      );

      const adjustedSpec = {
        ...column.spec,
        axesSpec: newAxesSpec,
        annotations: {
          ...column.spec.annotations,
          "pl7.app/trace": JSON.stringify(traceEntries),
        },
      };

      result.push({
        id: column.id,
        spec: adjustedSpec,
        dataStatus: "ready",
        data: entriesToDataInfo(filteredData),
      });
    }
  }

  return { items: result, complete: true };
}

const MAX_KEY_COMBINATIONS = 10_000;

function generateKeyCombinations(
  uniqueKeys: (string | number)[][],
  splitAxisIdxs: number[],
): (string | number)[][] {
  const combinations: (string | number)[][] = [];

  function generate(currentCombo: (string | number)[], sAxisIdx: number): void {
    if (sAxisIdx >= splitAxisIdxs.length) {
      combinations.push([...currentCombo]);
      if (combinations.length > MAX_KEY_COMBINATIONS) {
        throw new Error("Too many key combinations, aborting.");
      }
      return;
    }

    const axisIdx = splitAxisIdxs[sAxisIdx];
    if (axisIdx >= uniqueKeys.length) {
      throw new Error(
        `Axis index ${axisIdx} out of bounds for unique keys array (length ${uniqueKeys.length})`,
      );
    }

    const axisValues = uniqueKeys[axisIdx];
    if (!axisValues || axisValues.length === 0) {
      combinations.length = 0;
      return;
    }

    for (const val of axisValues) {
      currentCombo.push(val);
      generate(currentCombo, sAxisIdx + 1);
      currentCombo.pop();
    }
  }

  generate([], 0);
  return combinations;
}
