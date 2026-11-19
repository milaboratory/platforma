import {
  createDefaultPTableParams,
  getAxisId,
  upgradePlDataTableStateV2,
  type FilterSpec,
  type PlDataTableGridStateCore,
  type PlDataTableSheet,
  type PlDataTableSheetState,
  type PlDataTableStateV2,
  type PlDataTableStateV2CacheEntry,
  type PlDataTableStateV2Normalized,
  type PlDataTableFilterSpecLeaf,
  type PlDataTableFilterMeta,
  type PlDataTableFilters,
  type PlDataTableFiltersWithMeta,
  type PTableColumnId,
  type PTableSorting,
} from "@platforma-sdk/model";
import {
  computed,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref,
  type WritableComputedRef,
} from "vue";
import type { PlDataTableSettingsV2 } from "../types";
import type { PlDataTableGridFields } from "./grid-state";
import { isJsonEqual, randomInt, getField, type Nil } from "@milaboratories/helpers";
import { isNil } from "es-toolkit";

/** The source the table shows, as the stored state has to describe it. */
export type PlDataTableTarget = {
  sourceId: string;
  sheets: PlDataTableSheet[];
};

/** A change the user made to the settings of one source. */
export type PlDataTableEdit = {
  sourceId: string;
  patch: Partial<Omit<PlDataTableStateV2CacheEntry, "sourceId">>;
};

/**
 * The stored state with the edits applied and, when a source is on screen,
 * brought in line with it: the stored state points at that source, the source
 * has an entry at the recent end of the cache, and its sheet selection names a
 * value each sheet offers.
 *
 * Every write of the table state is this function's result, whether the user
 * edited something or only the source on screen changed, so a table mounted
 * on a source the stored state does not point at writes the same way a sort
 * does.
 */
export function reduceTableState(
  stored: PlDataTableStateV2Normalized,
  target: null | PlDataTableTarget,
  edits: PlDataTableEdit[],
): PlDataTableStateV2Normalized {
  const edited = edits.reduce(applyEdit, stored);
  const aligned = isNil(target) ? edited : alignWithTarget(edited, target);
  return aligned.stateCache.length > CACHE_DEPTH
    ? { ...aligned, stateCache: aligned.stateCache.slice(-CACHE_DEPTH) }
    : aligned;
}

/**
 * The value shown on each sheet: the saved one while the sheet still offers it,
 * otherwise the sheet's default, otherwise its first option. Sheets without
 * options are not shown and get no entry.
 */
export function resolveSheetsState(
  sheets: PlDataTableSheet[],
  saved: PlDataTableSheetState[],
): PlDataTableSheetState[] {
  return sheets
    .filter((sheet) => sheet.options.length > 0)
    .map((sheet) => {
      const axisId = getAxisId(sheet.axis);
      const savedValue = saved.find((s) => isJsonEqual(s.axisId, axisId))?.value;
      const value =
        !isNil(savedValue) && isSheetOption(sheet, savedValue)
          ? savedValue
          : !isNil(sheet.defaultValue) && isSheetOption(sheet, sheet.defaultValue)
            ? sheet.defaultValue
            : sheet.options[0].value;
      return { axisId, value };
    });
}

export function useTableState(
  tableStateDenormalized: Ref<PlDataTableStateV2>,
  settings: Ref<PlDataTableSettingsV2>,
  defaultFilters: Ref<Nil | PlDataTableFilters>,
): {
  /** Source whose settings the controls show and edit; `null` while there is none. */
  sourceId: ComputedRef<null | string>;
  /** The grid's own state for the source on screen, to restore the grid from */
  gridState: ComputedRef<PlDataTableGridStateCore>;
  /** Sorting the user set on the source on screen; `null` while untouched */
  sorting: ComputedRef<null | PTableSorting[]>;
  /** Columns the user hid on the source on screen; `null` while untouched */
  hiddenColIds: ComputedRef<null | PTableColumnId[]>;
  getEntry: (sourceId: string) => undefined | PlDataTableStateV2CacheEntry;
  updateGrid: (sourceId: string, grid: PlDataTableGridFields) => void;
  sheetsState: WritableComputedRef<PlDataTableSheetState[]>;
  searchString: WritableComputedRef<string>;
  filtersState: WritableComputedRef<PlDataTableFiltersWithMeta>;
  defaultFiltersState: WritableComputedRef<null | PlDataTableFiltersWithMeta>;
  resetDefaultFilters: () => void;
} {
  const stored = computed(() => upgradePlDataTableStateV2(tableStateDenormalized.value));
  const target = computed<null | PlDataTableTarget>(() =>
    settings.value.sourceId === null
      ? null
      : { sourceId: settings.value.sourceId, sheets: settings.value.sheets },
  );

  // Edits are kept until the stored state reports them back. Until then the
  // platform may hand back a state that predates them: a change by another
  // author, such as a running block, replaces the whole block state with the
  // project's copy, which lacks edits still waiting to be sent. Each such push
  // would otherwise undo what the user just did.
  const pendingEdits = shallowRef<PlDataTableEdit[]>([]);
  const state = computed(() => reduceTableState(stored.value, target.value, pendingEdits.value));

  function commit(): void {
    const base = stored.value;
    const unconfirmed = pendingEdits.value.filter(
      (edit) =>
        !isJsonEqual(
          reduceTableState(base, target.value, [edit]),
          reduceTableState(base, target.value, []),
        ),
    );
    if (unconfirmed.length !== pendingEdits.value.length) pendingEdits.value = unconfirmed;

    const next = reduceTableState(base, target.value, unconfirmed);
    if (!isJsonEqual(next, base)) tableStateDenormalized.value = next;
  }
  watch([stored, target, pendingEdits], commit, { immediate: true });

  function edit(change: PlDataTableEdit): void {
    pendingEdits.value = [...pendingEdits.value, change];
    commit();
  }

  // While the model reports an error there is no source on screen; the
  // controls keep showing the last one, so a filter that caused the error can
  // still be removed.
  const sourceId = computed<null | string>(() => {
    const current = settings.value;
    if (current.sourceId !== null) return current.sourceId;
    return current.error !== null ? stored.value.pTableParams.sourceId : null;
  });
  const entry = computed(() => findEntry(state.value, sourceId.value));

  function editCurrent(patch: PlDataTableEdit["patch"]): void {
    if (sourceId.value !== null) edit({ sourceId: sourceId.value, patch });
  }

  const gridState = computed<PlDataTableGridStateCore>(() => entry.value?.gridState ?? {});
  const sorting = computed(() => entry.value?.sorting ?? null);
  const hiddenColIds = computed(() => entry.value?.hiddenColIds ?? null);

  const sheetsState = computed<PlDataTableSheetState[]>({
    get: () => entry.value?.sheetsState ?? [],
    set: (sheetsState) => editCurrent({ sheetsState }),
  });

  const filtersState = computed<PlDataTableFiltersWithMeta>({
    get: () => {
      const raw = entry.value?.filtersState;
      return isNil(raw) ? getEmptyGroupWithMeta() : normalizeFiltersState(raw);
    },
    set: (filtersState) => editCurrent({ filtersState }),
  });

  const defaultFiltersState = computed<null | PlDataTableFiltersWithMeta>({
    get: () => {
      const raw = entry.value?.defaultFiltersState;
      if (!isNil(raw)) return normalizeFiltersState(raw);
      if (!isNil(defaultFilters.value)) {
        return annotateFiltersWithIds(normalizeFiltersState(defaultFilters.value));
      }
      return null;
    },
    set: (defaultFiltersState) => editCurrent({ defaultFiltersState }),
  });

  function resetDefaultFilters(): void {
    defaultFiltersState.value = isNil(defaultFilters.value)
      ? null
      : annotateFiltersWithIds(normalizeFiltersState(defaultFilters.value));
  }

  const searchString = computed<string>({
    get: () => entry.value?.searchString ?? "",
    set: (searchString) => editCurrent({ searchString }),
  });

  return {
    sourceId,
    gridState,
    sorting,
    hiddenColIds,
    getEntry: (id) => findEntry(state.value, id),
    updateGrid: (id, grid) => edit({ sourceId: id, patch: grid }),
    sheetsState,
    searchString,
    filtersState,
    defaultFiltersState,
    resetDefaultFilters,
  };
}

// Internals

const CACHE_DEPTH = 5;

type FilterNode = FilterSpec<PlDataTableFilterSpecLeaf>;
type AnnotatedFilterSpec = FilterSpec<PlDataTableFilterSpecLeaf, PlDataTableFilterMeta>;

function applyEdit(
  state: PlDataTableStateV2Normalized,
  { sourceId, patch }: PlDataTableEdit,
): PlDataTableStateV2Normalized {
  const current = findEntry(state, sourceId);
  const entry = { ...(current ?? createEntry(sourceId)), ...patch };
  return {
    ...state,
    stateCache: isNil(current)
      ? [...state.stateCache, entry]
      : state.stateCache.map((e) => (e === current ? entry : e)),
  };
}

function alignWithTarget(
  state: PlDataTableStateV2Normalized,
  { sourceId, sheets }: PlDataTableTarget,
): PlDataTableStateV2Normalized {
  const current = findEntry(state, sourceId) ?? createEntry(sourceId);
  const entry = { ...current, sheetsState: resolveSheetsState(sheets, current.sheetsState) };
  return {
    ...state,
    stateCache: [...state.stateCache.filter((e) => e.sourceId !== sourceId), entry],
    pTableParams: { ...createDefaultPTableParams(), sourceId },
  };
}

function findEntry(
  state: PlDataTableStateV2Normalized,
  sourceId: null | string,
): undefined | PlDataTableStateV2CacheEntry {
  if (isNil(sourceId)) return undefined;
  return state.stateCache.find((e) => e.sourceId === sourceId);
}

function createEntry(sourceId: string): PlDataTableStateV2CacheEntry {
  return {
    sourceId,
    gridState: {},
    sorting: null,
    hiddenColIds: null,
    sheetsState: [],
    filtersState: null,
    defaultFiltersState: null,
  };
}

function isSheetOption(sheet: PlDataTableSheet, value: string | number): boolean {
  return sheet.options.some((option) => option.value === value);
}

/**
 * Normalizes raw filter state into a valid root filter structure.
 * Valid structure is Root(Group, Group, ...) — double nesting required:
 * root is and/or group, each child is also and/or group containing leaf filters.
 * - null/undefined/invalid → empty root
 * - Leaf node → Root(Group(leaf))
 * - Group with leaf children → Root(Group(leaves...))
 * - Group with group children → as-is
 */
function normalizeFiltersState(raw: FilterNode) {
  // Leaf node → wrap in double nesting: Root(Group(leaf))
  if (raw.type !== "and" && raw.type !== "or" && raw.type !== "not") {
    if ("type" in raw && !isNil(raw.type)) {
      return {
        id: randomInt(),
        type: "and" as const,
        isExpanded: true,
        filters: [
          {
            id: randomInt(),
            type: "and" as const,
            isExpanded: true,
            filters: [raw as AnnotatedFilterSpec],
          } as AnnotatedFilterSpec,
        ],
      };
    }
    return getEmptyGroupWithMeta();
  }

  // Already a group — ensure children are also groups (double nesting)
  if ((raw.type === "and" || raw.type === "or") && "filters" in raw && Array.isArray(raw.filters)) {
    const allChildrenAreGroups = raw.filters.every(
      (f: FilterNode) => f.type === "and" || f.type === "or" || f.type === "not",
    );
    if (allChildrenAreGroups) {
      return raw as PlDataTableFiltersWithMeta;
    }
    // Children are leaves — wrap them in a single group
    return {
      id: randomInt(),
      type: raw.type as "and" | "or",
      isExpanded: true,
      filters: [
        {
          id: randomInt(),
          type: raw.type as "and" | "or",
          isExpanded: true,
          filters: raw.filters as AnnotatedFilterSpec[],
        } as AnnotatedFilterSpec,
      ],
    };
  }

  return getEmptyGroupWithMeta();
}

function getEmptyGroup(): PlDataTableFilters {
  return {
    type: "and" as const,
    filters: [],
  };
}
function getEmptyGroupWithMeta(): PlDataTableFiltersWithMeta {
  return {
    ...getEmptyGroup(),
    id: randomInt(),
    isExpanded: true,
  } as PlDataTableFiltersWithMeta;
}

/**
 * Recursively ensures every node in a filter tree has an `id` field.
 * Does not set `source` meta — defaults are now a separate list.
 */
function annotateFiltersWithIds(
  filters: PlDataTableFilters | PlDataTableFiltersWithMeta,
): PlDataTableFiltersWithMeta {
  return annotateNodeWithIds(filters) as PlDataTableFiltersWithMeta;
}

function annotateNodeWithIds(
  node: FilterNode | PlDataTableFilters | PlDataTableFiltersWithMeta,
): AnnotatedFilterSpec {
  switch (node.type) {
    case "and":
      return {
        id: getField(node, "id") ?? randomInt(),
        isExpanded: getField(node, "isExpanded") ?? true,
        type: "and" as const,
        filters: node.filters.map((child) => annotateNodeWithIds(child)),
      };
    case "or":
      return {
        id: getField(node, "id") ?? randomInt(),
        isExpanded: getField(node, "isExpanded") ?? true,
        type: "or" as const,
        filters: node.filters.map((child) => annotateNodeWithIds(child)),
      };
    case "not":
      return {
        id: randomInt(),
        isExpanded: true,
        type: "not" as const,
        filter: annotateNodeWithIds(node.filter),
      };
    default:
      return { ...node, id: getField(node, "id") ?? randomInt() } as AnnotatedFilterSpec;
  }
}
