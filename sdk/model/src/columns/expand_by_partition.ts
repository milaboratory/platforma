import type {
  AxisFilterByIdx,
  AxisFilterValue,
  AxisId,
  PartitionedDataInfoEntries,
} from "@milaboratories/pl-model-common";
import {
  canonicalizeAxisId,
  entriesToDataInfo,
  getAxisId,
  isPartitionedDataInfoEntries,
} from "@milaboratories/pl-model-common";
import type { TreeNodeAccessor } from "../render/accessor";
import { filterDataInfoEntries } from "../render/util/axis_filtering";
import { convertOrParsePColumnData, getUniquePartitionKeys } from "../render/util/pcolumn_data";
import type { ColumnSnapshot } from "./column_snapshot";
import { createReadyColumnData } from "./column_snapshot";

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
  /** Expanded snapshots (one per key combination per original snapshot). */
  readonly items: ColumnSnapshot[];
  /** False if any column's data was not ready for splitting. */
  readonly complete: boolean;
}

// --- Implementation ---

/**
 * Expand snapshots by splitting along partition axes.
 *
 * For each snapshot, reads partition data, enumerates unique keys on the
 * split axes, and produces one output snapshot per key combination —
 * with the split axes removed from `axesSpec` and a `pl7.app/trace`
 * annotation recording the split origin.
 *
 * Returns `{ items: [], complete: false }` when any snapshot's data
 * is not ready (status !== 'ready' or partition data unavailable).
 */
export function expandByPartition(
  snapshots: ColumnSnapshot[],
  splitAxes: SplitAxis[],
  opts?: ExpandByPartitionOpts,
): ExpandByPartitionResult {
  if (splitAxes.length === 0) {
    return { items: snapshots, complete: true };
  }

  const splitAxisIdxs = splitAxes.map((a) => a.idx).sort((a, b) => a - b);
  const result: ColumnSnapshot[] = [];

  for (const snapshot of snapshots) {
    if (snapshot.dataStatus !== "ready" || snapshot.data === undefined) {
      return { items: [], complete: false };
    }

    const rawData = snapshot.data.get();
    const dataEntries = convertOrParsePColumnData(rawData as TreeNodeAccessor | undefined);

    if (dataEntries === undefined) {
      return { items: [], complete: false };
    }

    if (!isPartitionedDataInfoEntries(dataEntries)) {
      throw new Error(
        `Splitting requires Partitioned DataInfoEntries, but got ${dataEntries.type} for column ${String(snapshot.id)}`,
      );
    }

    const uniqueKeys = getUniquePartitionKeys(dataEntries);

    const maxSplitIdx = splitAxisIdxs[splitAxisIdxs.length - 1];
    if (maxSplitIdx >= dataEntries.partitionKeyLength) {
      throw new Error(
        `Not enough partition keys (${dataEntries.partitionKeyLength}) for requested split axes (max index ${maxSplitIdx}) in column ${snapshot.spec.name}`,
      );
    }

    // Resolve labels for each split axis
    const axesLabels: (undefined | Record<string | number, string>)[] = splitAxisIdxs.map((idx) =>
      opts?.axisLabels?.(getAxisId(snapshot.spec.axesSpec[idx])),
    );

    // Generate all key combinations across split axes
    const keyCombinations = generateKeyCombinations(uniqueKeys, splitAxisIdxs);
    if (keyCombinations.length === 0) continue;

    // Build adjusted axesSpec (remove split axes in reverse order)
    const newAxesSpec = [...snapshot.spec.axesSpec];
    for (let i = splitAxisIdxs.length - 1; i >= 0; i--) {
      newAxesSpec.splice(splitAxisIdxs[i], 1);
    }

    for (const keyCombo of keyCombinations) {
      const axisFilters: AxisFilterByIdx[] = keyCombo.map(
        (value, sAxisIdx): AxisFilterByIdx => [splitAxisIdxs[sAxisIdx], value as AxisFilterValue],
      );

      const traceEntries = keyCombo.map((value, sAxisIdx) => {
        const axisIdx = splitAxisIdxs[sAxisIdx];
        const axisId = getAxisId(snapshot.spec.axesSpec[axisIdx]);
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
        ...snapshot.spec,
        axesSpec: newAxesSpec,
        annotations: {
          ...snapshot.spec.annotations,
          "pl7.app/trace": JSON.stringify(traceEntries),
        },
      };

      result.push({
        id: snapshot.id,
        spec: adjustedSpec,
        dataStatus: "ready",
        data: createReadyColumnData(() => entriesToDataInfo(filteredData)),
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
