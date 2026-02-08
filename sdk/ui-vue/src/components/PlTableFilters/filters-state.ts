import type { Reactive, Ref } from "vue";
import { reactive, ref, watch } from "vue";
import type { PlDataTableFiltersSettings, PlDataTableFilterStateInternal } from "./types";
import {
  canonicalizeJson,
  getPTableColumnId,
  type CanonicalizedJson,
  type PTableColumnId,
  type PlDataTableFilterState,
} from "@platforma-sdk/model";
import { isJsonEqual } from "@milaboratories/helpers";
import {
  getFilterOptions,
  makeDiscreteOptions,
  isFilterValid,
  getColumnName,
  isAlphabetic,
} from "./filters_logic";

export function useFilters(
  settings: Ref<PlDataTableFiltersSettings>,
  state: Ref<PlDataTableFilterState[]>,
): Reactive<{
  value: PlDataTableFilterStateInternal[];
}> {
  // Watcher instead of computed to preserve open state of filters locally
  const defaultStateMap = ref<
    Map<CanonicalizedJson<PTableColumnId>, PlDataTableFilterStateInternal>
  >(new Map());
  const filters = reactive<{
    value: PlDataTableFilterStateInternal[];
  }>({
    value: [],
  });
  watch(
    () => settings.value,
    ({ columns, config: configFn, cachedState }) => {
      // Comptute default states for columns
      const defaultStateMapValue = (defaultStateMap.value = new Map(
        columns
          .map((c, i) => {
            try {
              const id = getPTableColumnId(c);
              const config = configFn(c);
              const options = config.options
                ? getFilterOptions(c).filter((o) => config.options!.includes(o.value))
                : getFilterOptions(c);
              if (options.length === 0) return null;
              const discreteOptions = makeDiscreteOptions(c);
              const defaultFilter =
                config.default && isFilterValid(config.default, options, discreteOptions)
                  ? config.default
                  : null;
              const filter = defaultFilter
                ? {
                    value: defaultFilter,
                    disabled: false,
                    open: false,
                  }
                : null;
              const state: PlDataTableFilterStateInternal = {
                id,
                spec: c,
                label: getColumnName(c, i),
                alphabetic: isAlphabetic(c),
                options,
                discreteOptions,
                defaultFilter,
                filter,
              };
              return [canonicalizeJson<PTableColumnId>(id), state] as const;
            } catch (err: unknown) {
              console.error(`Filter creation for column ${c.id} has failed`, err);
              return null;
            }
          })
          .filter((e) => e !== null),
      ));

      // Go through cached state, filter out states for not present columns, update state to match valid options
      const stateMap = new Map<CanonicalizedJson<PTableColumnId>, PlDataTableFilterStateInternal>(
        cachedState
          .filter((s) => defaultStateMapValue.has(canonicalizeJson<PTableColumnId>(s.id)))
          .map((s) => {
            const defaultState = defaultStateMapValue.get(canonicalizeJson<PTableColumnId>(s.id))!;
            const state = {
              ...defaultState,
              filter:
                s.filter &&
                isFilterValid(s.filter.value, defaultState.options, defaultState.discreteOptions)
                  ? {
                      ...s.filter,
                      open:
                        filters.value.find((f) => isJsonEqual(f.id, s.id))?.filter?.open ?? false,
                    }
                  : null,
            } satisfies PlDataTableFilterStateInternal;
            return [canonicalizeJson<PTableColumnId>(s.id), state] as const;
          }),
      );

      // Set default states for columns not present in cached state
      for (const [idKey, state] of defaultStateMapValue) {
        if (!stateMap.has(idKey)) {
          stateMap.set(idKey, state);
        }
      }

      // States with not null filters should go first, in order they were added, then follow null filters in alphabetic order
      const states = stateMap
        .values()
        .filter((s) => s.filter)
        .toArray();
      const hiddenFilters = stateMap
        .values()
        .filter((s) => !s.filter)
        .toArray();
      states.push(...hiddenFilters.sort((a, b) => a.label.localeCompare(b.label)));
      filters.value = states;
    },
    { immediate: true },
  );

  // Persist state on change
  watch(
    () => filters.value,
    (filters) => {
      const cachedState = filters.map(
        (f) =>
          ({
            id: f.id,
            alphabetic: f.alphabetic,
            filter: f.filter
              ? {
                  value: f.filter.value,
                  disabled: f.filter.disabled,
                }
              : null,
          }) satisfies PlDataTableFilterState,
      );
      if (cachedState.length > 0 && !isJsonEqual(cachedState, state.value)) {
        state.value = cachedState;
      }
    },
    {
      immediate: true,
      deep: true,
    },
  );

  return filters;
}
