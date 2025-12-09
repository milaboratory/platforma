import type {
  AnchoredIdDeriver,
  AnchoredPColumnSelector,
  AxisFilterByIdx,
  AxisFilterValue,
  AxisId,
  NativePObjectId,
  PartitionedDataInfoEntries,
  PColumn,
  PColumnLazy,
  PColumnSelector,
  PColumnSpec,
  PColumnValues,
  PObjectId,
  ResolveAnchorsOptions,
  SUniversalPColumnId,
} from '@milaboratories/pl-model-common';
import {
  Annotation,
  canonicalizeAxisId,
  deriveNativeId,
  entriesToDataInfo,
  getAxisId,
  getColumnIdAndSpec,
  isLinkerColumn,
  isPartitionedDataInfoEntries,
  isPColumnSpec,
  LinkerMap,
  matchAxisId,
  resolveAnchors,
  selectorsToPredicate,
} from '@milaboratories/pl-model-common';
import canonicalize from 'canonicalize';
import type { Optional } from 'utility-types';
import type { TreeNodeAccessor } from '../accessor';
import type { PColumnDataUniversal } from '../api';
import { filterDataInfoEntries } from './axis_filtering';
import type { LabelDerivationOps, TraceEntry } from './label';
import { deriveLabels } from './label';
import { convertOrParsePColumnData, getUniquePartitionKeys } from './pcolumn_data';
import type { APColumnSelectorWithSplit, PColumnSelectorWithSplit } from './split_selectors';

function isPColumnValues(value: unknown): value is PColumnValues {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return true;
  const first = value[0];
  return typeof first === 'object' && first !== null && 'key' in first && 'val' in first;
}

export interface ColumnProvider {
  selectColumns(selectors: ((spec: PColumnSpec) => boolean) | PColumnSelector | PColumnSelector[]): PColumn<PColumnDataUniversal | undefined>[];
}

export interface AxisLabelProvider {
  findLabels(axis: AxisId): Record<string | number, string> | undefined;
}

/**
 * A simple implementation of {@link ColumnProvider} backed by a pre-defined array of columns.
 */
class ArrayColumnProvider implements ColumnProvider {
  constructor(private readonly columns: PColumn<PColumnDataUniversal | undefined>[]) {}

  selectColumns(selectors: ((spec: PColumnSpec) => boolean) | PColumnSelector | PColumnSelector[]):
  PColumn<PColumnDataUniversal | undefined>[] {
    const predicate = typeof selectors === 'function' ? selectors : selectorsToPredicate(selectors);
    // Filter based on spec, ignoring data type for now
    return this.columns.filter((column): column is PColumn<PColumnDataUniversal | undefined> => predicate(column.spec));
  }
}

/** Lazy calculates the data, returns undefined if data is not ready. */
export type PColumnLazyWithLabel<T> = PColumnLazy<T> & {
  label: string;
};

/** Universal column is a column that uses a universal column id, and always have label. */
export type PColumnLazyUniversal<T> = PColumnLazyWithLabel<T> & {
  id: SUniversalPColumnId;
};

/** @deprecated Use PColumnLazyWithLabel instead. */
export type PColumnEntryWithLabel = PColumnLazy<undefined | PColumnDataUniversal> & {
  label: string;
};

/** @deprecated Use PColumnLazyUniversal instead. */
export type PColumnEntryUniversal = PColumnEntryWithLabel & {
  id: SUniversalPColumnId;
};

// Helper types similar to those in api.ts
type AxisFilterInfo = {
  axisIdx: number;
  axisId: AxisId;
  value: AxisFilterValue;
  label: string;
};

// Intermediate representation for columns requiring splitting
type IntermediateSplitEntry = {
  type: 'split';
  originalColumn: PColumn<PColumnDataUniversal | undefined>;
  spec: PColumnSpec;
  /** With splitting axes removed */
  adjustedSpec: PColumnSpec;
  dataEntries: PartitionedDataInfoEntries<TreeNodeAccessor>;
  axisFilters: AxisFilterInfo[];
};

// Intermediate representation for columns NOT requiring splitting
type IntermediateDirectEntry = {
  type: 'direct';
  originalColumn: PColumn<PColumnDataUniversal | undefined>;
  spec: PColumnSpec;
  /** The same as `spec` */
  adjustedSpec: PColumnSpec;
};

// Union type for intermediate processing
type IntermediateColumnEntry = IntermediateSplitEntry | IntermediateDirectEntry;

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
  /** If provided, columns matching the provided selectors will be excluded from the result. */
  exclude?: AnchoredPColumnSelector | AnchoredPColumnSelector[];
  labelOps?: LabelDerivationOps;
  /** If true, incomplete data will cause the column to be skipped instead of returning undefined for the whole request. */
  dontWaitAllData?: boolean;
  /**
   * If true, the derived label will override the 'pl7.app/label' annotation
   * in the resulting PColumnSpec. It also forces `includeNativeLabel` in `labelOps` to true,
   * unless `labelOps.includeNativeLabel` is explicitly set to false.
   * Default value in getUniversalEntries is false, in getColumns it is true.
   */
  overrideLabelAnnotation?: boolean;
  /** If true, resulting columns will be enriched by other columns considering linker columns. Default is true. */
  enrichByLinkers?: boolean;
};

type UniversalPColumnOpts = UniversalPColumnOptsNoDeriver & {
  anchorCtx: AnchoredIdDeriver;
} & ResolveAnchorsOptions;

export class PColumnCollection {
  private readonly defaultProviderStore: PColumn<PColumnDataUniversal | undefined>[] = [];
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

  public addColumns(columns: PColumn<PColumnDataUniversal | undefined>[]): this {
    this.defaultProviderStore.push(...columns);
    return this;
  }

  public addColumn(column: PColumn<PColumnDataUniversal | undefined>): this {
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

  // Overload signatures updated to return PColumnEntry types
  public getUniversalEntries(
    predicateOrSelectors: ((spec: PColumnSpec) => boolean) | APColumnSelectorWithSplit | APColumnSelectorWithSplit[],
    opts: UniversalPColumnOpts): PColumnEntryUniversal[] | undefined;
  public getUniversalEntries(
    predicateOrSelectors: ((spec: PColumnSpec) => boolean) | PColumnSelectorWithSplit | PColumnSelectorWithSplit[],
    opts?: UniversalPColumnOptsNoDeriver): PColumnEntryWithLabel[] | undefined;
  public getUniversalEntries(
    predicateOrSelectors: ((spec: PColumnSpec) => boolean) | APColumnSelectorWithSplit | APColumnSelectorWithSplit[],
    opts?: Optional<UniversalPColumnOpts, 'anchorCtx'>): (PColumnEntryWithLabel | PColumnEntryUniversal)[] | undefined {
    const { anchorCtx, labelOps: rawLabelOps, dontWaitAllData = false, overrideLabelAnnotation = false, exclude, enrichByLinkers = false } = opts ?? {};

    const labelOps: LabelDerivationOps = {
      ...(overrideLabelAnnotation && rawLabelOps?.includeNativeLabel !== false ? { includeNativeLabel: true } : {}),
      ...(rawLabelOps ?? {}),
    };

    let excludePredicate: ((spec: PColumnSpec) => boolean) = () => false;
    if (exclude) {
      const excludePredicartes = (Array.isArray(exclude) ? exclude : [exclude])
        .map((selector) => {
          if (hasAnchors(selector)) {
            if (!anchorCtx)
              throw new Error('Anchored selectors in exclude require an AnchoredIdDeriver to be provided in options.');
            return selectorsToPredicate(resolveAnchors(anchorCtx.anchors, selector, opts));
          } else
            return selectorsToPredicate(selector);
        });
      excludePredicate = (spec) => excludePredicartes.some((predicate) => predicate(spec));
    }

    const selectorsArray = typeof predicateOrSelectors === 'function'
      ? [predicateOrSelectors]
      : Array.isArray(predicateOrSelectors)
        ? predicateOrSelectors
        : [predicateOrSelectors];

    const intermediateResults: IntermediateColumnEntry[] = [];
    const selectedNativeIds = new Set<NativePObjectId>();

    for (const rawSelector of selectorsArray) {
      const usesAnchors = hasAnchors(rawSelector);

      let currentSelector: PColumnSelectorWithSplit | ((spec: PColumnSpec) => boolean);
      if (usesAnchors) {
        if (!anchorCtx)
          throw new Error('Anchored selectors require an AnchoredIdDeriver to be provided in options.');
        currentSelector = resolveAnchors(anchorCtx.anchors, rawSelector as AnchoredPColumnSelector, opts);
      } else
        currentSelector = rawSelector as PColumnSelectorWithSplit | ((spec: PColumnSpec) => boolean);

      const selectedIds = new Set<PObjectId>();
      const selectedColumns: PColumn<PColumnDataUniversal | undefined>[] = [];
      for (const provider of this.providers) {
        const providerColumns = provider.selectColumns(currentSelector);
        for (const col of providerColumns) {
          if (excludePredicate(col.spec)) continue;
          if (selectedIds.has(col.id))
            throw new Error(`Duplicate column id ${col.id} in provider ${provider.constructor.name}`);
          const nativeId = deriveNativeId(col.spec);
          if (selectedNativeIds.has(nativeId))
            continue;
          selectedIds.add(col.id);
          selectedNativeIds.add(nativeId);
          selectedColumns.push(col);
        }
      }

      if (selectedColumns.length === 0) continue;

      const splitAxisIdxs = getSplitAxisIndices(rawSelector);
      const needsSplitting = splitAxisIdxs.length > 0;

      for (const column of selectedColumns) {
        if (!isPColumnSpec(column.spec)) continue;

        const originalSpec = column.spec;

        if (needsSplitting) {
          if (isPColumnValues(column.data))
            throw new Error(`Splitting is not supported for PColumns with PColumnValues data format. Column id: ${column.id}`);
          const dataEntries = convertOrParsePColumnData(column.data);

          if (!dataEntries) {
            if (dontWaitAllData) continue;
            return undefined;
          }

          if (!isPartitionedDataInfoEntries(dataEntries))
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
              if (keyCombinations.length > 10000)
                throw new Error('Too many key combinations, aborting.');
              return;
            }
            const axisIdx = splitAxisIdxs[sAxisIdx];
            if (axisIdx >= uniqueKeys.length)
              throw new Error(`Axis index ${axisIdx} out of bounds for unique keys array (length ${uniqueKeys.length}) during split key generation for column ${column.id}`);
            const axisValues = uniqueKeys[axisIdx];
            if (!axisValues || axisValues.length === 0) {
              keyCombinations.length = 0; // No combinations possible if one axis has no keys
              return;
            }
            for (const val of axisValues) {
              currentCombo.push(val);
              generateCombinations(currentCombo, sAxisIdx + 1);
              currentCombo.pop();
            }
          };

          generateCombinations([], 0);

          if (keyCombinations.length === 0)
            continue;

          const newAxesSpec = [...originalSpec.axesSpec];
          const splitAxisOriginalIdxs = splitAxisIdxs.map((idx) => idx); // Keep original indices for axisId lookup
          // Remove axes in reverse order to maintain correct indices during removal
          for (let i = splitAxisIdxs.length - 1; i >= 0; i--) {
            newAxesSpec.splice(splitAxisIdxs[i], 1);
          }
          const adjustedSpec = { ...originalSpec, axesSpec: newAxesSpec };

          for (const keyCombo of keyCombinations) {
            const splitFilters: AxisFilterInfo[] = keyCombo.map((value, sAxisIdx) => {
              const axisIdx = splitAxisOriginalIdxs[sAxisIdx]; // Use original index for lookup
              const axisId = getAxisId(originalSpec.axesSpec[axisIdx]);
              const axisLabelMap = axesLabels[sAxisIdx];
              const label = axisLabelMap?.[value] ?? String(value);
              return { axisIdx, axisId, value: value as AxisFilterValue, label };
            });

            intermediateResults.push({
              type: 'split',
              originalColumn: column,
              spec: originalSpec,
              adjustedSpec,
              dataEntries,
              axisFilters: splitFilters,
            });
          }
        } else {
          intermediateResults.push({
            type: 'direct',
            originalColumn: column,
            spec: originalSpec,
            adjustedSpec: originalSpec,
          });
        }
      }
    }

    if (intermediateResults.length === 0) return [];

    const labeledResults = deriveLabels(
      intermediateResults,
      (entry) => ({
        spec: entry.spec,
        suffixTrace: entry.type === 'split' ? splitFiltersToTrace(entry.axisFilters) : undefined,
      }),
      labelOps,
    );

    const result: (PColumnEntryWithLabel | PColumnEntryUniversal)[] = [];

    for (const { value: entry, label } of labeledResults) {
      const { originalColumn, spec: originalSpec } = entry;

      const axisFilters = entry.type === 'split' ? entry.axisFilters : undefined;
      const axisFiltersTuple = splitFiltersToAxisFilter(axisFilters);

      let finalId: SUniversalPColumnId | PObjectId;
      if (anchorCtx) finalId = anchorCtx.deriveS(originalSpec, axisFiltersTuple);
      else finalId = fallbackIdDeriver(originalColumn.id, axisFiltersTuple);

      let finalSpec = { ...entry.adjustedSpec };

      if (overrideLabelAnnotation) {
        finalSpec = {
          ...finalSpec,
          annotations: {
            ...(finalSpec.annotations ?? {}),
            [Annotation.Label]: label,
          } satisfies Annotation,
        };
      }

      result.push({
        id: finalId,
        spec: finalSpec,
        data: () => entry.type === 'split'
          ? entriesToDataInfo(filterDataInfoEntries(entry.dataEntries, axisFiltersTuple!))
          : entry.originalColumn.data,
        label: label,
      });
    }

    const ids = new Set(result.map((entry) => entry.id));

    if (enrichByLinkers && anchorCtx) {
      const linkers = result.filter((entry) => isLinkerColumn(entry.spec));
      if (linkers.length === 0) {
        return result;
      };

      const anchorAxes = Object.values(anchorCtx.anchors).flatMap((anchor) => anchor.axesSpec);
      const linkerMap = LinkerMap.fromColumns(linkers.map(getColumnIdAndSpec));

      // loose way of matching
      function matchAxisIdFn(linkerKeyId: AxisId, sourceAxisId: AxisId): boolean {
        return matchAxisId(linkerKeyId, sourceAxisId) || matchAxisId(sourceAxisId, linkerKeyId);
      }
      // search all axes that can be reached by linkers from anchor axes; anchor axes are not in this list;
      const availableByLinkersAxes = linkerMap.getReachableByLinkersAxesFromAxes(anchorAxes, matchAxisIdFn);

      // search all columns that includes at least one of additional axes;
      const availableByLinkersColumns = this.getUniversalEntries(
        (spec) => !isLinkerColumn(spec) && spec.axesSpec.some((columnAxisSpec) => {
          const columnAxisId = getAxisId(columnAxisSpec);
          return availableByLinkersAxes.some((axis) => matchAxisIdFn(getAxisId(axis), columnAxisId));
        }),
        { anchorCtx, labelOps, dontWaitAllData, overrideLabelAnnotation, exclude },
      );
      if (availableByLinkersColumns) {
        result.push(...availableByLinkersColumns.filter((entry) => !ids.has(entry.id)));
      }
    }

    return result;
  }

  public getColumns(
    predicateOrSelectors: ((spec: PColumnSpec) => boolean) | APColumnSelectorWithSplit | APColumnSelectorWithSplit[],
    opts: UniversalPColumnOpts): PColumn<PColumnDataUniversal>[] | undefined;
  public getColumns(
    predicateOrSelectors: ((spec: PColumnSpec) => boolean) | PColumnSelectorWithSplit | PColumnSelectorWithSplit[],
    opts?: UniversalPColumnOptsNoDeriver): PColumn<PColumnDataUniversal>[] | undefined;
  public getColumns(
    predicateOrSelectors: ((spec: PColumnSpec) => boolean) | APColumnSelectorWithSplit | APColumnSelectorWithSplit[],
    opts?: Optional<UniversalPColumnOpts, 'anchorCtx'>): PColumn<PColumnDataUniversal>[] | undefined {
    const entries = this.getUniversalEntries(predicateOrSelectors, {
      overrideLabelAnnotation: true, // default for getColumns
      ...(opts ?? {}),
    } as UniversalPColumnOpts);
    if (!entries) return undefined;

    const columns: PColumn<PColumnDataUniversal>[] = [];
    for (const entry of entries) {
      const data = entry.data();
      if (!data) {
        if (opts?.dontWaitAllData) continue;
        return undefined;
      }
      columns.push({
        id: entry.id,
        spec: entry.spec,
        data,
      });
    }

    return columns;
  }
}
