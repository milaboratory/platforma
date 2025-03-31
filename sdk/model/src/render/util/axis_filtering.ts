import type {
  BinaryChunk,
  DataInfoEntries,
  PColumnDataEntry,
  PColumnKey,
  PColumnValue,
  JsonDataInfoEntries,
  JsonPartitionedDataInfoEntries,
  BinaryPartitionedDataInfoEntries,
} from '@milaboratories/pl-model-common';
import type { AxisFilterByIdx } from '@milaboratories/pl-model-common';

/**
 * Filters DataInfoEntries using axis filters, removing specified axes from keys and
 * only keeping entries that match the filter values.
 *
 * @param dataInfoEntries - The data info object to filter
 * @param axisFilters - Array of axis filters (index, value pairs)
 * @throws Error if any filter axis is outside the partitioning axes or data axes for Json data
 */
export function filterDataInfoEntries<Blob>(
  dataInfoEntries: BinaryPartitionedDataInfoEntries<Blob>,
  axisFilters: AxisFilterByIdx[],
): BinaryPartitionedDataInfoEntries<Blob>;
export function filterDataInfoEntries<Blob>(
  dataInfoEntries: JsonPartitionedDataInfoEntries<Blob>,
  axisFilters: AxisFilterByIdx[],
): JsonPartitionedDataInfoEntries<Blob>;
export function filterDataInfoEntries<Blob>(
  dataInfoEntries: BinaryPartitionedDataInfoEntries<Blob> | JsonPartitionedDataInfoEntries<Blob>,
  axisFilters: AxisFilterByIdx[],
): BinaryPartitionedDataInfoEntries<Blob> | JsonPartitionedDataInfoEntries<Blob>;
export function filterDataInfoEntries(
  dataInfoEntries: JsonDataInfoEntries,
  axisFilters: AxisFilterByIdx[],
): JsonDataInfoEntries;
export function filterDataInfoEntries<Blob>(
  dataInfoEntries: DataInfoEntries<Blob>,
  axisFilters: AxisFilterByIdx[],
): DataInfoEntries<Blob> {
  // Sort filters by axis index in descending order to safely remove elements from arrays
  const sortedFilters = [...axisFilters].sort((a, b) => b[0] - a[0]);

  // Check for invalid filter axes
  if (dataInfoEntries.type === 'JsonPartitioned' || dataInfoEntries.type === 'BinaryPartitioned') {
    const { partitionKeyLength } = dataInfoEntries;
    for (const [axisIdx] of axisFilters)
      if (axisIdx >= partitionKeyLength)
        throw new Error(`Can't filter on non-partitioned axis ${axisIdx}. Must be >= ${partitionKeyLength}`);
  } else if (dataInfoEntries.type === 'Json') {
    const { keyLength } = dataInfoEntries;
    for (const [axisIdx] of axisFilters)
      if (axisIdx >= keyLength)
        throw new Error(`Can't filter on non-data axis ${axisIdx}. Must be >= ${keyLength}`);
  }

  const keyMatchesFilters = (key: PColumnKey): boolean => {
    for (const [axisIdx, axisValue] of sortedFilters)
      if (key[axisIdx] !== axisValue)
        return false;
    return true;
  };

  const removeFilteredAxes = (key: PColumnKey): PColumnKey => {
    const newKey = [...key];

    // Remove axes in descending order to maintain correct indices
    for (const [axisIdx] of sortedFilters)
      newKey.splice(axisIdx, 1);

    return newKey;
  };

  switch (dataInfoEntries.type) {
    case 'Json': {
      const filteredData: PColumnDataEntry<PColumnValue>[] = dataInfoEntries.data
        .filter((entry: PColumnDataEntry<PColumnValue>) => keyMatchesFilters(entry.key))
        .map((entry: PColumnDataEntry<PColumnValue>) => ({
          key: removeFilteredAxes(entry.key),
          value: entry.value,
        }));

      return {
        type: 'Json',
        keyLength: dataInfoEntries.keyLength - axisFilters.length,
        data: filteredData,
      };
    }

    case 'JsonPartitioned': {
      const filteredParts = dataInfoEntries.parts
        .filter((entry: PColumnDataEntry<Blob>) => keyMatchesFilters(entry.key))
        .map((entry: PColumnDataEntry<Blob>) => ({
          key: removeFilteredAxes(entry.key),
          value: entry.value,
        }));

      return {
        type: 'JsonPartitioned',
        partitionKeyLength: dataInfoEntries.partitionKeyLength - axisFilters.length,
        parts: filteredParts,
      };
    }

    case 'BinaryPartitioned': {
      const filteredParts = dataInfoEntries.parts
        .filter((entry: PColumnDataEntry<BinaryChunk<Blob>>) => keyMatchesFilters(entry.key))
        .map((entry: PColumnDataEntry<BinaryChunk<Blob>>) => ({
          key: removeFilteredAxes(entry.key),
          value: entry.value,
        }));

      return {
        type: 'BinaryPartitioned',
        partitionKeyLength: dataInfoEntries.partitionKeyLength - axisFilters.length,
        parts: filteredParts,
      };
    }
  }
}
