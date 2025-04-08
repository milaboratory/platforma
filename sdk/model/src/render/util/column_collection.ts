import type {
  AnchoredIdDeriver,
  AxisId,
  DataInfo,
  PColumn,
  PColumnSelector,
  PColumnSpec,
  PObjectId,
  SUniversalPColumnId,
  PValue,
  AxisFilterByIdx,
  DataInfoEntries,
  AnchoredPColumnSelector,
} from '@milaboratories/pl-model-common';
import {
  selectorsToPredicate,
  resolveAnchors,
  getAxisId,
  isPColumnSpec,
  canonicalizeAxisId,
  entriesToDataInfo,
  isDataInfo,
  dataInfoToEntries,
} from '@milaboratories/pl-model-common';
import { TreeNodeAccessor } from '../accessor';
import type { LabelDerivationOps, TraceEntry } from './label';
import { deriveLabels } from './label';
import type { Optional } from 'utility-types';
import type { APColumnSelectorWithSplit, PColumnSelectorWithSplit } from './split_selectors';
import canonicalize from 'canonicalize';
import { getUniquePartitionKeys, parsePColumnData } from './pcolumn_data';
import { filterDataInfoEntries } from './axis_filtering';

export interface ColumnProvider {
  selectColumns(selectors: ((spec: PColumnSpec) => boolean) | PColumnSelector | PColumnSelector[]): PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | undefined>[];
}

export interface AxisLabelProvider {
  findLabels(axis: AxisId): Record<string | number, string> | undefined;
}

/**
 * A simple implementation of {@link ColumnProvider} backed by a pre-defined array of columns.
 */
class ArrayColumnProvider implements ColumnProvider {
  constructor(private readonly columns: PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | undefined>[]) {}

  selectColumns(selectors: ((spec: PColumnSpec) => boolean) | PColumnSelector | PColumnSelector[]):
  PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | undefined>[] {
    const predicate = typeof selectors === 'function' ? selectors : selectorsToPredicate(selectors);
    // Filter based on spec, ignoring data type for now
    return this.columns.filter((column): column is PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | undefined> => predicate(column.spec));
  }
}

export type PColumnWithLabel<Data> = PColumn<Data> & {
  label: string;
};

/** Universal column is a column that uses a universal column id, and always have label. */
export type UniversalPColumn<Data> = PColumnWithLabel<Data> & {
  id: SUniversalPColumnId;
};

// Helper types similar to those in api.ts
type AxisFilterInfo = {
  axisIdx: number;
  axisId: AxisId;
  value: PValue;
  label: string;
};

type IntermediateColumnEntry = {
  originalColumn: PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | undefined>;
  spec: PColumnSpec;
  dataEntries: PartitionedDataInfoEntries<TreeNodeAccessor>;
  axisFilters?: AxisFilterInfo[];
};

function splitFiltersToTrace(splitFilters?: AxisFilterInfo[]): TraceEntry[] | undefined {
  if (!splitFilters) return undefined;
  return splitFilters.map((filter) => ({
    type: `split:${canonicalizeAxisId(filter.axisId)}`,
    label: filter.label,
    importance: 1_000_000, // High importance for split filters in labels
  }));
}

function splitFiltersToAxisFilter(splitFilters?: AxisFilterInfo[]): AxisFilterByIdx[] | undefined {
  if (!splitFilters) return undefined;
  return splitFilters.map((filter): AxisFilterByIdx => [filter.axisIdx, filter.value]);
}

function fallbackIdDeriver(originalId: PObjectId, axisFilters?: AxisFilterByIdx[]): PObjectId {
  if (!axisFilters || axisFilters.length === 0) return originalId;
  const filtersToCanonicalize = [...axisFilters].sort((a, b) => a[0] - b[0]);
  return canonicalize({ id: originalId, axisFilters: filtersToCanonicalize })! as PObjectId;
}

/** Checks if a selector object uses any anchor properties */
function hasAnchors(selector: unknown): selector is AnchoredPColumnSelector {
  if (!selector || typeof selector !== 'object') return false;
  const potentialAnchored = selector as Record<string, any>;
  const domainHasAnchors = potentialAnchored['domain'] && typeof potentialAnchored['domain'] === 'object' && Object.values(potentialAnchored['domain']).some((v: unknown) => typeof v === 'object' && v !== null && 'anchor' in v);
  const axesHaveAnchors = potentialAnchored['axes'] && Array.isArray(potentialAnchored['axes']) && potentialAnchored['axes'].some((a: unknown) => typeof a === 'object' && a !== null && 'anchor' in a);
  return !!potentialAnchored['domainAnchor'] || domainHasAnchors || axesHaveAnchors;
}

/**
   * Derives the indices of axes marked for splitting based on the selector.
   * Throws an error if splitting is requested alongside `partialAxesMatch`.
   */
function getSplitAxisIndices(selector: APColumnSelectorWithSplit | ((spec: PColumnSpec) => boolean)): number[] {
  if (typeof selector !== 'object' || !('axes' in selector) || selector.axes === undefined) {
    return []; // No axes specified or not an object selector, no splitting
  }

  const splitIndices = selector.axes
    .map((axis, index) => (typeof axis === 'object' && 'split' in axis && axis.split === true) ? index : -1)
    .filter((index) => index !== -1);

  if (splitIndices.length > 0 && selector.partialAxesMatch !== undefined) {
    throw new Error('Axis splitting is not supported when `partialAxesMatch` is defined.');
  }

  splitIndices.sort((a, b) => a - b);
  return splitIndices;
}

type UniversalPColumnOptsNoDeriver = {
  labelOps?: LabelDerivationOps;
  dontWaitAllData?: boolean;
  /**
   * If true, the derived label will override the 'pl7.app/label' annotation
   * in the resulting PColumnSpec. It also forces `includeNativeLabel` in `labelOps` to true,
   * unless `labelOps.includeNativeLabel` is explicitly set to false.
   */
  overrideLabelAnnotation?: boolean;
};

type UniversalPColumnOpts = UniversalPColumnOptsNoDeriver & {
  anchorsOrCtx: AnchoredIdDeriver;
};

export class PColumnCollection {
  private readonly defaultProviderStore: PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | undefined>[] = [];
  private readonly providers: ColumnProvider[] = [new ArrayColumnProvider(this.defaultProviderStore)];
  private readonly axisLabelProviders: AxisLabelProvider[] = [];

  constructor() {}

  public addColumnProvider(provider: ColumnProvider): this {
    this.providers.push(provider);
    return this;
  }

  public addAxisLabelProvider(provider: AxisLabelProvider): this {
    this.axisLabelProviders.push(provider);
    return this;
  }

  public addColumns(columns: PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | undefined>[]): this {
    this.defaultProviderStore.push(...columns);
    return this;
  }

  public addColumn(column: PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | undefined>): this {
    this.defaultProviderStore.push(column);
    return this;
  }

  /** Fetches labels for a given axis from the registered providers */
  private findLabels(axis: AxisId): Record<string | number, string> | undefined {
    for (const provider of this.axisLabelProviders) {
      const labels = provider.findLabels(axis);
      if (labels) return labels; // First provider wins
    }
    return undefined;
  }

  public getUniversalColumns(
    predicateOrSelectors: ((spec: PColumnSpec) => boolean) | APColumnSelectorWithSplit | APColumnSelectorWithSplit[],
    opts: UniversalPColumnOpts): UniversalPColumn<DataInfo<TreeNodeAccessor>>[] | undefined;
  public getUniversalColumns(
    predicateOrSelectors: ((spec: PColumnSpec) => boolean) | PColumnSelectorWithSplit | PColumnSelectorWithSplit[],
    opts?: UniversalPColumnOptsNoDeriver): PColumnWithLabel<DataInfo<TreeNodeAccessor>>[] | undefined;
  public getUniversalColumns(
    predicateOrSelectors: ((spec: PColumnSpec) => boolean) | APColumnSelectorWithSplit | APColumnSelectorWithSplit[],
    opts?: Optional<UniversalPColumnOpts, 'anchorsOrCtx'>): (PColumnWithLabel<DataInfo<TreeNodeAccessor>> | UniversalPColumn<DataInfo<TreeNodeAccessor>>)[] | undefined {
    const { anchorsOrCtx, labelOps: rawLabelOps, dontWaitAllData = false, overrideLabelAnnotation = false } = opts ?? {};
    const idDeriver = anchorsOrCtx;

    const labelOps: LabelDerivationOps = {
      ...(overrideLabelAnnotation && rawLabelOps?.includeNativeLabel !== false ? { includeNativeLabel: true } : {}),
      ...(rawLabelOps ?? {}),
    };

    const selectorsArray = typeof predicateOrSelectors === 'function'
      ? [predicateOrSelectors]
      : Array.isArray(predicateOrSelectors)
        ? predicateOrSelectors
        : [predicateOrSelectors];

    const intermediateResults: IntermediateColumnEntry[] = [];

    for (const rawSelector of selectorsArray) {
      const usesAnchors = hasAnchors(rawSelector);
      if (usesAnchors && !idDeriver)
        throw new Error('Anchored selectors require an AnchoredIdDeriver to be provided in options.');

      let currentSelector: PColumnSelectorWithSplit | ((spec: PColumnSpec) => boolean);
      if (usesAnchors && idDeriver)
        currentSelector = resolveAnchors(idDeriver.anchors, rawSelector as AnchoredPColumnSelector);
      else
        currentSelector = rawSelector as PColumnSelectorWithSplit | ((spec: PColumnSpec) => boolean);

      const selectedIds = new Set<PObjectId>();
      const selectedColumns: PColumn<TreeNodeAccessor | DataInfo<TreeNodeAccessor> | undefined>[] = [];
      for (const provider of this.providers) {
        const providerColumns = provider.selectColumns(currentSelector);
        for (const col of providerColumns) {
          if (selectedIds.has(col.id)) throw new Error(`Duplicate column id ${col.id} in provider ${provider.constructor.name}`);
          selectedIds.add(col.id);
          selectedColumns.push(col);
        }
      }

      if (selectedColumns.length === 0) continue;

      const splitAxisIdxs = getSplitAxisIndices(rawSelector);
      const needsSplitting = splitAxisIdxs.length > 0;

      for (const column of selectedColumns) {
        if (!isPColumnSpec(column.spec)) continue;

        const originalSpec = column.spec;
        const columnData = column.data;

        let dataEntries: DataInfoEntries<TreeNodeAccessor> | undefined;

        if (columnData instanceof TreeNodeAccessor) {
          dataEntries = parsePColumnData(columnData);
        } else if (isDataInfo(columnData)) {
          dataEntries = dataInfoToEntries(columnData as DataInfo<TreeNodeAccessor>);
        } else if (columnData === undefined) {
          if (dontWaitAllData) continue;
          return undefined; // Data not ready
        } else {
          throw new Error(`Unexpected column data type in collection: ${typeof columnData}`);
        }

        if (!dataEntries) {
          if (dontWaitAllData) continue;
          return undefined;
        }

        if (needsSplitting) {
          if (dataEntries.type !== 'JsonPartitioned' && dataEntries.type !== 'BinaryPartitioned') 
            throw new Error(`Splitting requires Partitioned DataInfoEntries, but parsing resulted in ${dataEntries.type} for column ${column.id}`);

          const uniqueKeys = getUniquePartitionKeys(dataEntries);

          const maxSplitIdx = splitAxisIdxs[splitAxisIdxs.length - 1];
          if (maxSplitIdx >= dataEntries.partitionKeyLength)
            throw new Error(`Not enough partition keys (${dataEntries.partitionKeyLength}) for requested split axes (max index ${maxSplitIdx}) in column ${originalSpec.name}`);

          const axesLabels: (Record<string | number, string> | undefined)[] = splitAxisIdxs
            .map((idx) => this.findLabels(getAxisId(originalSpec.axesSpec[idx])));

          const keyCombinations: (string | number)[][] = [];
          const generateCombinations = (currentCombo: (string | number)[], sAxisIdx: number) => {
            if (sAxisIdx >= splitAxisIdxs.length) {
              keyCombinations.push([...currentCombo]);
              return;
            }
            const axisIdx = splitAxisIdxs[sAxisIdx];
            if (axisIdx >= uniqueKeys.length)
              // Should not happen due to pre-flight checks
              throw new Error(`Axis index ${axisIdx} out of bounds for unique keys array (length ${uniqueKeys.length}) during split key generation for column ${column.id}`);
            const axisValues = uniqueKeys[axisIdx];
            if (!axisValues || axisValues.length === 0) {
              // If an axis we need to split by has no values, we can't generate combinations
              keyCombinations.length = 0; // Clear potentially partial results
              return;
            }
            for (const val of axisValues) {
              currentCombo.push(val);
              generateCombinations(currentCombo, sAxisIdx + 1);
              currentCombo.pop();
            }
          };

          generateCombinations([], 0);

          if (keyCombinations.length === 0 && uniqueKeys.some((axisKeys) => axisKeys.length > 0)) 
            continue; // No data, skip this column

          for (const keyCombo of keyCombinations) {
            const splitFilters: AxisFilterInfo[] = keyCombo.map((value, sAxisIdx) => {
              const axisIdx = splitAxisIdxs[sAxisIdx];
              const axisId = getAxisId(originalSpec.axesSpec[axisIdx]);
              const axisLabelMap = axesLabels[sAxisIdx];
              const label = axisLabelMap?.[value] ?? String(value);
              return { axisIdx, axisId, value: value as PValue, label };
            });

            intermediateResults.push({
              originalColumn: column,
              spec: originalSpec,
              dataEntries,
              axisFilters: splitFilters,
            });
          }
        } else {
          intermediateResults.push({
            originalColumn: column,
            spec: originalSpec,
            dataEntries,
          });
        }
      }
    }

    if (intermediateResults.length === 0) return [];

    const labeledResults = deriveLabels(
      intermediateResults,
      (entry) => ({
        spec: entry.spec,
        suffixTrace: splitFiltersToTrace(entry.axisFilters),
      }),
      labelOps,
    );

    const finalResultColumns: (PColumnWithLabel<DataInfo<TreeNodeAccessor>> | UniversalPColumn<DataInfo<TreeNodeAccessor>>)[] = [];

    for (const { value: entry, label } of labeledResults) {
      const { originalColumn, spec: currentSpecInput, dataEntries: originalDataEntries, axisFilters } = entry;
      const axisFiltersTuple = splitFiltersToAxisFilter(axisFilters);

      let finalId: SUniversalPColumnId | PObjectId;
      if (idDeriver) finalId = idDeriver.deriveS(currentSpecInput, axisFiltersTuple);
      else finalId = fallbackIdDeriver(originalColumn.id, axisFiltersTuple);

      let finalDataInfo: DataInfo<TreeNodeAccessor>;
      let finalSpec = { ...currentSpecInput };
      const needsFiltering = axisFiltersTuple && axisFiltersTuple.length > 0;

      if (needsFiltering) {          
        if (originalDataEntries.type !== 'JsonPartitioned' && originalDataEntries.type !== 'BinaryPartitioned') {
          // Filtering also requires partitioned data
          throw new Error(`Filtering requires Partitioned DataInfoEntries, got ${originalDataEntries.type} for column ${finalId}`);
        }

        const filteredEntries = filterDataInfoEntries(originalDataEntries, axisFiltersTuple);
        finalDataInfo = entriesToDataInfo(filteredEntries);

        // Adjust spec axes after filtering
        const axisIndicesToRemove = axisFiltersTuple.map((f) => f[0]).sort((a, b) => b - a);
        const newAxesSpec = [...finalSpec.axesSpec];
        for (const idx of axisIndicesToRemove) {
          newAxesSpec.splice(idx, 1);
        }
        finalSpec = { ...finalSpec, axesSpec: newAxesSpec };
      } else {
        // No filtering needed, just convert the stored DataInfoEntries back to DataInfo
        if (!originalDataEntries) {
          // This shouldn't happen
          console.error(`Internal error: Missing data entries for non-filtering column instance derived from ${originalColumn.id}.`);
          if (dontWaitAllData) continue;
          return undefined;
        }
        finalDataInfo = entriesToDataInfo(originalDataEntries);
      }

      if (overrideLabelAnnotation) {
        finalSpec = {
          ...finalSpec,
          annotations: {
            ...(finalSpec.annotations ?? {}),
            'pl7.app/label': label,
          },
        };
      }

      // Construct final column object
      const resultColumnBase = {
        spec: finalSpec,
        data: finalDataInfo,
        label: label,
      };

      if (idDeriver) {
        finalResultColumns.push({
          ...resultColumnBase,
          id: finalId as SUniversalPColumnId,
        });
      } else {
        finalResultColumns.push({
          ...resultColumnBase,
          id: finalId as PObjectId,
        });
      }
    }
    // --- Final Label Derivation and Processing --- END ---

    return finalResultColumns;
  }
}
