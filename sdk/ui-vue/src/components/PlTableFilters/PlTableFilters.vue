<script lang="ts" setup>
import type { ListOption } from '@milaboratories/uikit';
import { PlBtnGhost, PlIcon24, PlSlideModal, PlMaskIcon16, PlMaskIcon24 } from '@milaboratories/uikit';
import { computed, onBeforeUnmount, onMounted, reactive, ref, toRefs, watch } from 'vue';
import type {
  PlTableFiltersModel,
  PlTableFilterType,
  PlTableFilter,
  PTableColumnSpec,
  PlTableFiltersState,
  PlTableFiltersStateEntry,
  PlTableFilterColumnId,
} from '@platforma-sdk/model';
import * as lodash from 'lodash';
import type { PlTableFiltersDefault, PlTableFiltersRestriction } from '../PlAgDataTable/types';
import PlTableFilterEntry from './PlTableFilterEntry.vue';
import PlTableAddFilter from './PlTableAddFilter.vue';
import {
  filterTypesNumber,
  filterTypesString,
  getColumnName,
  getFilterDefault,
  getFilterLabel,
  makeColumnId,
  makePredicate,
} from './filters_logic';
import './pl-table-filters.scss';
import { useDataTableToolsPanelTarget } from '../PlAgDataTableToolsPanel';

const model = defineModel<PlTableFiltersModel>({ required: true });
const props = defineProps<{
  columns: Readonly<PTableColumnSpec[]>;
  restrictions?: Readonly<PlTableFiltersRestriction[]>;
  defaults?: Readonly<PlTableFiltersDefault[]>;
}>();
const { columns, restrictions, defaults } = toRefs(props);

const columnsById = computed<Record<PlTableFilterColumnId, PTableColumnSpec>>(() => {
  const filterableColumn = columns.value.filter((column) => {
    const type = column.type;
    switch (type) {
      case 'axis':
        return column.spec.type !== 'Bytes';
      case 'column':
        return column.spec.valueType !== 'Bytes';
      default:
        throw Error(`unsupported data type: ${type satisfies never}`);
    }
  });
  const result: Record<PlTableFilterColumnId, PTableColumnSpec> = {};
  for (const column of filterableColumn) {
    result[makeColumnId(column)] = column;
  }
  return result;
});
const restrictionsMap = computed<Record<PlTableFilterColumnId, PlTableFilterType[]>>(() => {
  const restrictionsValue = restrictions.value ?? [];
  const map: Record<PlTableFilterColumnId, PlTableFilterType[]> = {};
  for (const [id, column] of Object.entries(columnsById.value)) {
    const entry = lodash.find(
      restrictionsValue,
      (entry) => lodash.isEqual(entry.column.id, column.id),
    );
    if (entry) map[id] = entry.allowedFilterTypes;
  }
  return map;
});
const defaultsMap = computed<Record<PlTableFilterColumnId, PlTableFiltersStateEntry>>(() => {
  const defaultsValue = defaults.value ?? [];
  const map: Record<PlTableFilterColumnId, PlTableFiltersStateEntry> = {};
  for (const [id, column] of Object.entries(columnsById.value)) {
    const entry = lodash.find(defaultsValue, (entry) => lodash.isEqual(entry.column.id, column.id));
    if (entry) {
      map[id] = {
        columnId: id,
        filter: entry.default,
        disabled: false,
      };
    }
  }
  return map;
});

/* State upgrader */ (() => {
  const state = model.value.state;
  if (typeof state === 'object' && !Array.isArray(state)) {
    model.value.state = Object
      .entries(state as unknown as Record<PlTableFilterColumnId, PlTableFilter>)
      .map(([id, filter]) => ({
        columnId: id,
        filter,
        disabled: false,
      }));
  }
})();
const makeState = (state?: PlTableFiltersState): PlTableFiltersState => {
  return state ?? Object.values(defaultsMap.value);
};
const reactiveModel = reactive({ state: makeState(model.value.state) });
watch(
  () => model.value,
  (model) => {
    if (!lodash.isEqual(reactiveModel.state, model.state)) {
      reactiveModel.state = makeState(model.state);
    }
  },
);
watch(
  () => reactiveModel,
  (reactiveModel) => {
    if (!lodash.isEqual(reactiveModel.state, model.value.state)) {
      model.value = {
        state: lodash.cloneDeep(reactiveModel.state),
        filters: reactiveModel.state
          .filter((entry) => !entry.disabled)
          .map((entry) => {
            const column = columnsById.value[entry.columnId];
            const { spec, ...columnId } = column;
            const _ = spec;
            return {
              type: 'bySingleColumnV2',
              column: columnId,
              predicate: makePredicate(column, entry.filter),
            };
          }),
      };
    }
  },
  {
    immediate: true,
    deep: true,
  },
);
watch(
  () => columnsById.value,
  (columnsById) => {
    // Do not reset filters when join is happening
    if (Object.keys(columnsById).length === 0 && reactiveModel.state !== undefined) return;
    reactiveModel.state = reactiveModel.state.filter((entry) => !!columnsById[entry.columnId]);
  },
  { immediate: true },
);
const filtersOn = computed(() => {
  // Do not indicate filters when join is happening
  return Object.keys(columnsById).length > 0 && reactiveModel.state.length > 0;
});

const filterOptions = computed<Record<PlTableFilterColumnId, ListOption<PlTableFilterType>[]>>(() => {
  const restrictionsMapValue = restrictionsMap.value;
  const map: Record<PlTableFilterColumnId, ListOption<PlTableFilterType>[]> = {};
  for (const [id, column] of Object.entries(columnsById.value)) {
    const valueType = column.type === 'column' ? column.spec.valueType : column.spec.type;
    let types: PlTableFilterType[] = valueType === 'String' ? filterTypesString : filterTypesNumber;

    const restrictionsEntry = restrictionsMapValue[id];
    if (restrictionsEntry) types = types.filter((type) => restrictionsEntry.includes(type));

    map[id] = types.map((type) => ({ value: type, text: getFilterLabel(type) }));
  }
  return map;
});
const filterOptionsPresent = computed<boolean>(() => {
  return lodash.some(Object.values(filterOptions.value), (options) => options.length > 0);
});
const columnOptions = computed<ListOption<PlTableFilterColumnId>[]>(() =>
  Object.entries(Object.entries(columnsById.value))
    .filter(([_i, [id, _column]]) => filterOptions.value[id].length > 0)
    .filter(([_i, [id, _column]]) => !reactiveModel.state.some((entry) => entry.columnId === id))
    .map(([i, [id, column]]) => ({
      label: getColumnName(column, i),
      value: id,
    })),
);

const makeFilter = (columnId: string): PlTableFiltersStateEntry =>
  defaultsMap.value[columnId] ?? {
    columnId,
    filter: getFilterDefault(filterOptions.value[columnId][0].value),
    disabled: false,
  };
const resetFilter = (index: number) => {
  reactiveModel.state[index] = makeFilter(reactiveModel.state[index].columnId);
};
const deleteFilter = (index: number) => reactiveModel.state.splice(index, 1);

const showManager = ref(false);
const showAddFilter = ref(false);
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});

const openState = reactive<Record<PlTableFilterColumnId, boolean>>({});
const toggleExpandFilter = (columnId: PlTableFilterColumnId) => {
  if (!openState[columnId]) openState[columnId] = true;
  else delete openState[columnId];
};

const scrollIsActive = ref(false);
const filterManager = ref<HTMLElement>();
let observer: ResizeObserver;
onMounted(() => {
  observer = new ResizeObserver(() => {
    const parent = filterManager.value?.parentElement;
    if (!parent) return;
    scrollIsActive.value = parent.scrollHeight > parent.clientHeight || parent.scrollWidth > parent.clientWidth;
  });
  if (filterManager.value && filterManager.value.parentElement) {
    observer.observe(filterManager.value!.parentElement);
  }
});

watch(filterManager, (newElement, oldElement) => {
  if (oldElement?.parentElement) {
    observer.unobserve(oldElement.parentElement);
  }
  if (newElement?.parentElement) {
    observer.observe(newElement.parentElement);
  }
});

onBeforeUnmount(() => {
  if (observer !== undefined) {
    observer.disconnect();
  }
});

const teleportTarget = useDataTableToolsPanelTarget();
</script>

<template>
  <Teleport v-if="mounted && teleportTarget" :to="teleportTarget">
    <PlBtnGhost @click.stop="showManager = true">
      Filters
      <template #append>
        <PlIcon24 :name="filtersOn ? 'filter-on' : 'filter'" />
      </template>
    </PlBtnGhost>
  </Teleport>

  <PlSlideModal v-model="showManager" :close-on-outside-click="false">
    <template #title>Manage Filters</template>
    <div ref="filterManager" class="pl-filter-manager d-flex flex-column gap-6">
      <div
        v-for="(entry, index) in reactiveModel.state"
        :key="entry.columnId"
        :class="{ open: openState[entry.columnId], disabled: entry.disabled }"
        class="pl-filter-manager__filter"
      >
        <div
          class="pl-filter-manager__header d-flex align-center gap-8"
          @click="toggleExpandFilter(entry.columnId)"
        >
          <div class="pl-filter-manager__expand-icon">
            <PlMaskIcon16 name="chevron-right" />
          </div>

          <div class="pl-filter-manager__title flex-grow-1 text-s-btn">
            {{ getColumnName(columnsById[entry.columnId], index) }}
          </div>

          <div class="pl-filter-manager__actions d-flex gap-12">
            <div class="pl-filter-manager__toggle" @click.stop="entry.disabled = !entry.disabled">
              <PlMaskIcon24 :name="entry.disabled ? 'view-hide' : 'view-show'" />
            </div>

            <div class="pl-filter-manager__delete" @click.stop="deleteFilter(index)">
              <PlMaskIcon24 name="close" />
            </div>
          </div>
        </div>

        <div class="pl-filter-manager__content d-flex gap-24 p-24 flex-column">
          <PlTableFilterEntry
            v-model="reactiveModel.state[index]"
            :disabled="entry.disabled"
            :column="columnsById[entry.columnId]"
            :options="filterOptions[entry.columnId]"
          />

          <div class="d-flex justify-center">
            <div
              :class="{ disabled: entry.disabled }"
              class="pl-filter-manager__revert-btn text-s-btn d-flex align-center gap-8"
              @click="resetFilter(index)"
            >
              Revert Settings to Default
              <PlMaskIcon24 name="reverse" />
            </div>
          </div>
        </div>
      </div>

      <div :class="{ 'pt-24': scrollIsActive }" class="pl-filter-manager__add-action-wrapper">
        <div
          v-if="columnOptions.length > 0"
          class="pl-filter-manager__add-btn"
          @click="showAddFilter = true"
        >
          <div class="pl-filter-manager__add-btn-icon">
            <PlMaskIcon16 name="add" />
          </div>
          <div class="pl-filter-manager__add-btn-title text-s-btn">Add Filter</div>
        </div>
      </div>

      <div v-if="!filterOptionsPresent">No filters applicable</div>
    </div>
  </PlSlideModal>

  <PlTableAddFilter
    v-model="showAddFilter"
    :columns-by-id="columnsById"
    :column-options="columnOptions"
    :filter-options="filterOptions"
    :make-filter="makeFilter"
    @add-filter="(entry) => reactiveModel.state.push(entry)"
  />
</template>
