import type {
  BinaryChunk,
  DataInfoEntries,
  PColumnDataEntry,
  PColumnKey,
  PColumnValue,
  JsonDataInfoEntries,
  JsonPartitionedDataInfoEntries,
  BinaryPartitionedDataInfoEntries,
  ParquetPartitionedDataInfoEntries,
  PartitionedDataInfoEntries,
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
  dataInfoEntries: ParquetPartitionedDataInfoEntries<Blob>,
  axisFilters: AxisFilterByIdx[],
): ParquetPartitionedDataInfoEntries<Blob>;
export function filterDataInfoEntries<Blob>(
  dataInfoEntries: BinaryPartitionedDataInfoEntries<Blob>,
  axisFilters: AxisFilterByIdx[],
): BinaryPartitionedDataInfoEntries<Blob>;
export function filterDataInfoEntries<Blob>(
  dataInfoEntries: JsonPartitionedDataInfoEntries<Blob>,
  axisFilters: AxisFilterByIdx[],
): JsonPartitionedDataInfoEntries<Blob>;
export function filterDataInfoEntries<Blob>(
  dataInfoEntries: PartitionedDataInfoEntries<Blob>,
  axisFilters: AxisFilterByIdx[],
): PartitionedDataInfoEntries<Blob>;
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
  const { type } = dataInfoEntries;
  switch (type) {
    case 'Json': {
      const { keyLength } = dataInfoEntries;
      for (const [axisIdx] of axisFilters)
        if (axisIdx >= keyLength)
          throw new Error(`Can't filter on non-data axis ${axisIdx}. Must be >= ${keyLength}`);
      break;
    }
    case 'JsonPartitioned':
    case 'BinaryPartitioned':
    case 'ParquetPartitioned': {
      const { partitionKeyLength } = dataInfoEntries;
      for (const [axisIdx] of axisFilters)
        if (axisIdx >= partitionKeyLength)
          throw new Error(`Can't filter on non-partitioned axis ${axisIdx}. Must be >= ${partitionKeyLength}`);
      break;
    }
    default:
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new Error(`Unsupported data info type: ${type satisfies never}`);
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
    case 'Json': return {
      type: 'Json',
      keyLength: dataInfoEntries.keyLength - axisFilters.length,
      data: dataInfoEntries.data
        .filter((entry) => keyMatchesFilters(entry.key))
        .map((entry) => ({
          key: removeFilteredAxes(entry.key),
          value: entry.value,
        } satisfies PColumnDataEntry<PColumnValue>)),
    };
    case 'JsonPartitioned': return {
      type: 'JsonPartitioned',
      partitionKeyLength: dataInfoEntries.partitionKeyLength - axisFilters.length,
      parts: dataInfoEntries.parts
        .filter((entry) => keyMatchesFilters(entry.key))
        .map((entry) => ({
          key: removeFilteredAxes(entry.key),
          value: entry.value,
        } satisfies PColumnDataEntry<Blob>)),
    };
    case 'BinaryPartitioned': return {
      type: 'BinaryPartitioned',
      partitionKeyLength: dataInfoEntries.partitionKeyLength - axisFilters.length,
      parts: dataInfoEntries.parts
        .filter((entry) => keyMatchesFilters(entry.key))
        .map((entry) => ({
          key: removeFilteredAxes(entry.key),
          value: entry.value,
        } satisfies PColumnDataEntry<BinaryChunk<Blob>>)),
    };
    case 'ParquetPartitioned': return {
      type: 'ParquetPartitioned',
      partitionKeyLength: dataInfoEntries.partitionKeyLength - axisFilters.length,
      parts: dataInfoEntries.parts
        .filter((entry) => keyMatchesFilters(entry.key))
        .map((entry) => ({
          key: removeFilteredAxes(entry.key),
          value: entry.value,
        } satisfies PColumnDataEntry<Blob>)),
    };
  }
}
