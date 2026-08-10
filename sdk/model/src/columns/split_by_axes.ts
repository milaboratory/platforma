import type {
  AxisFilterByIdx,
  AxisFilterValue,
  AxisId,
  TraceEntry,
} from "@milaboratories/pl-model-common";
import {
  Annotation,
  canonicalizeAxisId,
  getAxisId,
  isDataInfoEntries,
  readAnnotation,
} from "@milaboratories/pl-model-common";
import { TreeNodeAccessor } from "../render/accessor";
import { getUniquePartitionKeys } from "../render/util/pcolumn_data";
import { deriveAxisValuesLabels } from "./derive_axis_values_labels";
import type { ColumnRecipe } from "./column_recipes";
import { ColumnFilteredRecipe } from "./column_recipes/column_filtered_recipe";
import { ColumnOverriddenRecipe } from "./column_recipes/column_overrided_recipe";
import { Column } from "./column";
import { hasReachableData } from "./utils";

// --- Types ---

export interface SplitAxis {
  /** Index of the axis in the column's axesSpec to split by. */
  readonly idx: number;
}

export interface SplitByAxesOpts {
  /**
   * Resolve axis values to human-readable labels.
   *
   * Defaults to {@link deriveAxisValuesLabels} over the ambient render ctx
   * (current block outputs + result pool), resolved lazily on the first
   * lookup. Pass an explicit callback to narrow the label source, or
   * `() => undefined` to keep raw axis values.
   */
  axisValuesLabels?: (axisId: AxisId) => undefined | Record<string | number, string>;
}

// --- Implementation ---

const MAX_KEY_COMBINATIONS = 10_000;

/**
 * Split each input column along the requested axes into one
 * {@link ColumnRecipe} per Cartesian combination of the axes' distinct values.
 *
 * The split axes must be partition-key axes of the input's data — the distinct
 * values are read off the partition keys.
 *
 * Each split is produced as `ColumnOverriddenRecipe.wrap(ColumnFilteredRecipe.wrap(inner, axisFilters), { domain, annotations })`:
 *   - `ColumnFilteredRecipe` pins all split axes at once (one wrap call with
 *     every `[idx, value]` pair) and removes them from `axesSpec`. The
 *     engine performs the data slicing via the `sliceAxes` query node.
 *   - `ColumnOverriddenRecipe` overlays a `domain[axisName] = String(value)`
 *     entry per split axis and appends a `split:<canonicalAxisId>` trace
 *     entry per split axis to the existing `pl7.app/trace` annotation.
 *
 * The recipe id is a canonical
 * `ColumnOverriddenId(source: ColumnFilteredId(source: inner.id, axisFilters), specOverrides)`
 * — distinct per split combination, parseable by `extractPObjectId`, and
 * traversable by recipe walkers.
 *
 * Returns `undefined` when any input's `getData()` is not a
 * {@link TreeNodeAccessor} — partition inspection is not yet possible.
 */
export function splitByAxes(
  inputs: Column[],
  splitAxes: SplitAxis[],
  opts?: SplitByAxesOpts,
): ColumnRecipe[] | undefined {
  if (splitAxes.length === 0) {
    return [...inputs];
  }

  const axisValuesLabels = opts?.axisValuesLabels ?? deriveAxisValuesLabels();

  const splitAxisIdxs = splitAxes.map((a) => a.idx).sort((a, b) => a - b);
  const maxSplitIdx = splitAxisIdxs[splitAxisIdxs.length - 1];

  const result: ColumnRecipe[] = [];

  for (const inner of inputs) {
    const data = hasReachableData(inner) ? inner.getData() : undefined;
    // Partition inspection requires either a live tree-accessor or already
    // parsed DataInfoEntries. Anything else means the input is not yet ready.
    if (!(data instanceof TreeNodeAccessor) && !isDataInfoEntries(data)) {
      return undefined;
    }

    const uniqueKeys = getUniquePartitionKeys(data);
    if (uniqueKeys === undefined) return undefined;

    if (maxSplitIdx >= uniqueKeys.length) {
      throw new Error(
        `Not enough partition keys (${uniqueKeys.length}) for requested split axes (max index ${maxSplitIdx}) in column ${inner.getSpec().name}`,
      );
    }

    const spec = inner.getSpec();
    const axesSpec = spec.axesSpec;
    const splitAxisSpecs = splitAxisIdxs.map((idx) => axesSpec[idx]);
    const splitAxisIds = splitAxisSpecs.map((axisSpec) => getAxisId(axisSpec));
    const axesLabels = splitAxisIds.map((axisId) => axisValuesLabels(axisId));

    const existingTraceRaw = readAnnotation(spec, Annotation.Trace);
    const baseTrace: TraceEntry[] = existingTraceRaw
      ? ((JSON.parse(existingTraceRaw) as TraceEntry[]) ?? [])
      : [];

    const keyCombinations = generateKeyCombinations(uniqueKeys, splitAxisIdxs);
    if (keyCombinations.length === 0) continue;

    for (const keyCombo of keyCombinations) {
      const axisFilters: AxisFilterByIdx[] = keyCombo.map(
        (value, sAxisIdx): AxisFilterByIdx => [splitAxisIdxs[sAxisIdx], value as AxisFilterValue],
      );

      const domain: Record<string, string> = {};
      const traceEntries: TraceEntry[] = [];
      for (let sAxisIdx = 0; sAxisIdx < keyCombo.length; sAxisIdx++) {
        const value = keyCombo[sAxisIdx];
        const axisSpec = splitAxisSpecs[sAxisIdx];
        const axisId = splitAxisIds[sAxisIdx];
        const labelMap = axesLabels[sAxisIdx];
        const label = labelMap?.[value] ?? String(value);
        domain[axisSpec.name] = String(value);
        traceEntries.push({
          type: `split:${canonicalizeAxisId(axisId)}`,
          label,
          importance: 1_000_000,
        });
      }

      const filtered = ColumnFilteredRecipe.wrap(inner, axisFilters);
      const overrided = ColumnOverriddenRecipe.wrap(filtered, {
        domain,
        annotations: {
          [Annotation.Trace]: JSON.stringify([...baseTrace, ...traceEntries]),
        },
      });

      result.push(overrided);
    }
  }

  return result;
}

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
