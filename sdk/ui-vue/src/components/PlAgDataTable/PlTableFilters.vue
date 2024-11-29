<script lang="ts" setup>
import type { ListOption } from '@milaboratories/uikit';
import { PlBtnGhost, PlBtnPrimary, PlDropdown, PlIcon24, PlSlideModal, PlTextField, PlToggleSwitch, Slider } from '@milaboratories/uikit';
import { computed, onMounted, reactive, ref, toRefs, watch } from 'vue';
import canonicalize from 'canonicalize';
import type {
  PlTableFiltersModel,
  PTableRecordFilter,
  SingleValuePredicateV2,
  PlTableFilterType,
  PlTableFilterNumberType,
  PlTableFilterStringType,
  PlTableFilter,
  PTableColumnSpec,
  PTableColumnId,
  PlTableFiltersState,
  PlTableFilterEntry,
} from '@platforma-sdk/model';
import * as lodash from 'lodash';
import type { PlTableFiltersDefault, PlTableFiltersRestriction } from './types';
import './pl-table-filters.scss';

const model = defineModel<PlTableFiltersModel>({ required: true });
const props = defineProps<{
  columns: Readonly<PTableColumnSpec[]>;
  restrictions?: Readonly<PlTableFiltersRestriction[]>;
  defaults?: Readonly<PlTableFiltersDefault[]>;
}>();
const { columns, restrictions, defaults } = toRefs(props);

import PlAgDataTableFilterManager from './PlAgDataTableFilterManager.vue';
import { PlAgDataTableToolsPanelId } from '../PlAgDataTableToolsPanel/PlAgDataTableToolsPanelId';
const showManager = ref(false);
const showManagerAddFilters = ref(false);
const selectedColumnIdForAdd = ref<string>();
const mounted = ref(false);

const makeColumnId = (column: PTableColumnId | PTableColumnSpec): string => canonicalize(column.id)!;

(() => {
  let state = model.value.state;
  if (state === undefined) {
    model.value.state = [];
  } else if (typeof state === 'object' && !Array.isArray(state)) {
    model.value.state = Object.entries(state as unknown as Record<string, PlTableFilter>).map(([id, filter]) => ({
      columnId: id,
      filter,
      disabled: false,
    }));
  }
})();

const columnsWithIds = computed(() => {
  return columns.value
    .filter((column) => {
      const type = column.type;
      switch (type) {
        case 'axis':
          return column.spec.type !== 'Bytes';
        case 'column':
          return column.spec.valueType !== 'Bytes';
        default:
          throw Error(`unsupported data type: ${type satisfies never}`);
      }
    })
    .map((column) => ({
      column,
      id: makeColumnId(column),
    }));
});
const restrictionsMap = computed(() => {
  const restrictionsValue = restrictions.value ?? [];
  const map: Record<string, PlTableFilterType[]> = {};
  for (const { column, id } of columnsWithIds.value) {
    const entry = lodash.find(restrictionsValue, (entry) => lodash.isEqual(entry.column.id, column.id));
    if (entry !== undefined) {
      map[id] = entry.allowedFilterTypes;
    }
  }
  return map;
});
const defaultsMap = computed(() => {
  const defaultsValue = defaults.value ?? [];
  const map: PlTableFiltersState = [];
  for (const { column, id } of columnsWithIds.value) {
    const entry = lodash.find(defaultsValue, (entry) => lodash.isEqual(entry.column.id, column.id));
    if (entry !== undefined) {
      map.push({ columnId: id, filter: entry.default, disabled: false });
    }
  }
  return map;
});

const makeState = (state?: PlTableFiltersState): PlTableFiltersState => {
  if (state !== undefined) return state;
  return defaultsMap.value;
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
  () => columnsWithIds.value,
  (columnsWithIds) => {
    if (reactiveModel.state !== undefined && columnsWithIds.length === 0) return;
    const currentState = reactiveModel.state ?? [];
    const newState: PlTableFiltersState = [];
    for (const { id } of columnsWithIds) {
      const item = currentState.find((i) => i.columnId === id);
      if (item) newState.push(item);
    }
    reactiveModel.state = newState;
  },
  { immediate: true },
);

const getFilterLabel = (type: PlTableFilterType): string => {
  switch (type) {
    case 'isNotNA':
      return 'Is not NA';
    case 'isNA':
      return 'Is NA';
    case 'number_equals':
    case 'string_equals':
      return 'Equals';
    case 'number_notEquals':
    case 'string_notEquals':
      return 'Not equals';
    case 'number_greaterThan':
      return 'Greater than';
    case 'number_greaterThanOrEqualTo':
      return 'Greater than or equal to';
    case 'number_lessThan':
      return 'Less than';
    case 'number_lessThanOrEqualTo':
      return 'Less than or equal to';
    case 'number_between':
      return 'Between';
    case 'string_contains':
      return 'Contains';
    case 'string_doesNotContain':
      return 'Does not contain';
    case 'string_matches':
      return 'Matches';
    case 'string_doesNotMatch':
      return 'Does not match';
    case 'string_containsFuzzyMatch':
      return 'Contains fuzzy match';
    default:
      throw Error(`unsupported filter type: ${type satisfies never}`);
  }
};

const filterTypesNumber: PlTableFilterNumberType[] = [
  'isNotNA',
  'isNA',
  'number_equals',
  'number_notEquals',
  'number_greaterThan',
  'number_greaterThanOrEqualTo',
  'number_lessThan',
  'number_lessThanOrEqualTo',
  'number_between',
] as const;
const filterTypesString: PlTableFilterStringType[] = [
  'isNotNA',
  'isNA',
  'string_equals',
  'string_notEquals',
  'string_contains',
  'string_doesNotContain',
  'string_matches',
  'string_doesNotMatch',
  'string_containsFuzzyMatch',
] as const;

const filterOptions = computed(() => {
  const restrictionsMapValue = restrictionsMap.value;
  const map: Record<string, ListOption<PlTableFilterType>[]> = {};
  for (const { column, id } of columnsWithIds.value) {
    const valueType = column.type === 'column' ? column.spec.valueType : column.spec.type;
    let types: PlTableFilterType[] = valueType === 'String' ? filterTypesString : filterTypesNumber;

    const restrictionsEntry = restrictionsMapValue[id];
    if (restrictionsEntry !== undefined) {
      types = types.filter((type) => restrictionsEntry.includes(type));
    }

    map[id] = types.map((type) => ({
      value: type,
      text: getFilterLabel(type),
    }));
  }
  return map;
});

const filterOptionsPresent = computed(() => {
  return lodash.some(Object.values(filterOptions.value), (options) => options.length > 0);
});

const getFilterReference = (filter: PlTableFilter): undefined | number | string => {
  const type = filter.type;
  switch (type) {
    case 'isNotNA':
    case 'isNA':
      return undefined;
    case 'number_equals':
    case 'number_notEquals':
    case 'number_greaterThan':
    case 'number_greaterThanOrEqualTo':
    case 'number_lessThan':
    case 'number_lessThanOrEqualTo':
      return filter.reference;
    case 'number_between':
      return filter.lowerBound;
    case 'string_equals':
    case 'string_notEquals':
    case 'string_contains':
    case 'string_doesNotContain':
    case 'string_matches':
    case 'string_doesNotMatch':
    case 'string_containsFuzzyMatch':
      return filter.reference;
    default:
      throw Error(`unsupported filter type: ${type satisfies never}`);
  }
};
const getFilterDefault = (type: PlTableFilterType, reference?: undefined | number | string): PlTableFilter => {
  switch (type) {
    case 'isNotNA':
    case 'isNA':
      return { type };
    case 'number_equals':
    case 'number_notEquals':
    case 'number_greaterThan':
    case 'number_greaterThanOrEqualTo':
    case 'number_lessThan':
    case 'number_lessThanOrEqualTo':
      return { type, reference: typeof reference === 'number' ? reference : 0 };
    case 'number_between':
      return {
        type,
        lowerBound: typeof reference === 'number' ? reference : 0,
        includeLowerBound: true,
        upperBound: 100,
        includeUpperBound: false,
      };
    case 'string_equals':
    case 'string_notEquals':
    case 'string_contains':
    case 'string_doesNotContain':
    case 'string_matches':
    case 'string_doesNotMatch':
      return { type, reference: typeof reference === 'string' ? reference : '' };
    case 'string_containsFuzzyMatch':
      return {
        type,
        reference: typeof reference === 'string' ? reference : '',
        maxEdits: 2,
        substitutionsOnly: false,
        wildcard: undefined,
      };
    default:
      throw Error(`unsupported filter type: ${type satisfies never}`);
  }
};
const updateColumnFilter = (columnId: string, type: PlTableFilterType): void => {
  const index = reactiveModel.state.findIndex((f) => f.columnId === columnId);
  if (index !== -1) {
    const prevFilter = reactiveModel.state[index];
    reactiveModel.state[index] = {
      columnId: prevFilter.columnId,
      filter: getFilterDefault(type, getFilterReference(prevFilter.filter)),
      disabled: false,
    };
  }
};
const resetColumnFilter = (columnId: string) => {
  const indexInMap = defaultsMap.value.findIndex((i) => i.columnId === columnId);
  const indexInReactiveModel = reactiveModel.state.findIndex((i) => i.columnId === columnId);

  reactiveModel.state![indexInReactiveModel] = defaultsMap.value[indexInMap] ?? {
    columnId,
    filter: getFilterDefault(filterOptions.value[columnId][0].value),
    disabled: false,
  };
};

const parseNumber = (column: PTableColumnSpec, value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw Error('Model value is not a number.');

  const type = column.type === 'column' ? column.spec.valueType : column.spec.type;
  if ((type === 'Int' || type === 'Long') && !Number.isInteger(parsed)) throw Error('Model value is not an integer.');

  const min = column.spec.annotations?.['pl7.app/min'];
  if (min !== undefined) {
    const minValue = Number(min);
    if (Number.isFinite(minValue) && parsed < Number(min)) {
      throw Error('Model value is too low.');
    }
  }

  const max = column.spec.annotations?.['pl7.app/max'];
  if (max !== undefined) {
    const maxValue = Number(max);
    if (Number.isFinite(maxValue) && parsed > Number(max)) {
      throw Error('Model value is too high.');
    }
  }

  return parsed;
};
const parseString = (column: PTableColumnSpec, value: string): string => {
  const alphabet = column.spec.domain?.['pl7.app/alphabet'] ?? column.spec.annotations?.['pl7.app/alphabet'];
  if (alphabet === 'nucleotide' && !/^[AaTtGgCcNn]+$/.test(value)) throw Error('Model value is not a nucleotide.');
  if (alphabet === 'aminoacid' && !/^[AaCcDdEeFfGgHhIiKkLlMmNnPpQqRrSsTtVvWwYyXx]+$/.test(value)) throw Error('Model value is not an aminoacid.');

  return value;
};
const parseRegex = (value: string): string => {
  try {
    new RegExp(value);
    return value;
  } catch (err: unknown) {
    if (err instanceof SyntaxError) throw Error('Model value is not a regexp.');
    throw err;
  }
};
const makeWildcardOptions = (column: PTableColumnSpec, reference: string) => {
  const alphabet = column.spec.domain?.['pl7.app/alphabet'] ?? column.spec.annotations?.['pl7.app/alphabet'];
  if (alphabet === 'nucleotide') {
    return [
      {
        value: 'N',
        text: 'N',
      },
    ];
  }
  if (alphabet === 'aminoacid') {
    return [
      {
        value: 'X',
        text: 'X',
      },
    ];
  }

  const chars = lodash.uniq(reference);
  chars.sort();
  return chars.map((char) => ({
    value: char,
    text: char,
  }));
};

const makePredicate = (filter: PlTableFilter): SingleValuePredicateV2 => {
  const type = filter.type;
  switch (type) {
    case 'isNotNA':
      return {
        operator: 'Not',
        operand: {
          operator: 'IsNA',
        },
      };
    case 'isNA':
      return {
        operator: 'IsNA',
      };
    case 'number_equals':
    case 'string_equals':
      return {
        operator: 'Equal',
        reference: filter.reference,
      };
    case 'number_notEquals':
    case 'string_notEquals':
      return {
        operator: 'Not',
        operand: {
          operator: 'Equal',
          reference: filter.reference,
        },
      };
    case 'number_greaterThan':
      return {
        operator: 'Greater',
        reference: filter.reference,
      };
    case 'number_greaterThanOrEqualTo':
      return {
        operator: 'GreaterOrEqual',
        reference: filter.reference,
      };
    case 'number_lessThan':
      return {
        operator: 'Less',
        reference: filter.reference,
      };
    case 'number_lessThanOrEqualTo':
      return {
        operator: 'LessOrEqual',
        reference: filter.reference,
      };
    case 'number_between':
      return {
        operator: 'And',
        operands: [
          {
            operator: filter.includeLowerBound ? 'GreaterOrEqual' : 'Greater',
            reference: filter.lowerBound,
          },
          {
            operator: filter.includeUpperBound ? 'LessOrEqual' : 'Less',
            reference: filter.upperBound,
          },
        ],
      };
    case 'string_contains':
      return {
        operator: 'StringContains',
        substring: filter.reference,
      };
    case 'string_doesNotContain':
      return {
        operator: 'Not',
        operand: {
          operator: 'StringContains',
          substring: filter.reference,
        },
      };
    case 'string_matches':
      return {
        operator: 'Matches',
        regex: filter.reference,
      };
    case 'string_doesNotMatch':
      return {
        operator: 'Not',
        operand: {
          operator: 'Matches',
          regex: filter.reference,
        },
      };
    case 'string_containsFuzzyMatch':
      return {
        operator: 'StringContainsFuzzy',
        reference: filter.reference,
        maxEdits: filter.maxEdits,
        substitutionsOnly: filter.substitutionsOnly,
        wildcard: filter.wildcard,
      };
    default:
      throw Error(`unsupported filter type: ${type satisfies never}`);
  }
};
const makeFilters = (state: PlTableFiltersState): PTableRecordFilter[] => {
  return columnsWithIds.value
    .map(({ column, id }) => {
      const entry = state.find((i) => i.columnId === id);
      if (!entry || entry.disabled) return undefined;
      //FIXME
      // const predicate = makePredicate(state[id].filter);
      const predicate = makePredicate(entry.filter);
      console.log('predicate', predicate);
      const { spec, ...columnId } = column;
      const _ = spec;

      return {
        type: 'bySingleColumnV2',
        column: columnId,
        predicate,
      } satisfies PTableRecordFilter;
    })
    .filter((entry) => entry !== undefined);
};

watch(
  () => reactiveModel,
  (reactiveModel) => {
    if (!lodash.isEqual(reactiveModel.state, model.value.state)) {
      model.value = {
        state: lodash.cloneDeep(reactiveModel.state),
        filters: makeFilters(reactiveModel.state),
      };
    }
  },
  {
    immediate: true,
    deep: true,
  },
);

const availableOption = computed(() =>
  columnsWithIds.value
    .map((colData, i) => ({
      label: colData.column.spec.annotations?.['pl7.app/label']?.trim() ?? 'Unlabeled ' + colData.column.type + ' ' + i.toString(),
      value: colData.id,
      colData,
    }))
    .filter((opt) => !reactiveModel.state.find((it) => it.columnId === opt.value)),
);

const reactiveModelTmpForAdd = reactive({ state: makeState(model.value.state) });

const updateColumnFilterTmp = (columnId: string, type: PlTableFilterType): void => {
  const index = reactiveModelTmpForAdd.state.findIndex((f) => f.columnId === columnId);
  if (index !== -1) {
    const prevFilter = reactiveModelTmpForAdd.state[index];
    reactiveModelTmpForAdd.state[index] = {
      columnId: prevFilter.columnId,
      filter: getFilterDefault(type, getFilterReference(prevFilter.filter)),
      disabled: false,
    };
  }
};

const resetColumnFilterTmp = (columnId: string) => {
  const indexInMap = defaultsMap.value.findIndex((i) => i.columnId === columnId);
  //This is TMP model here is only one item!!!
  reactiveModelTmpForAdd.state = [
    defaultsMap.value[indexInMap] ?? {
      columnId,
      filter: getFilterDefault(filterOptions.value[columnId][0].value),
      disabled: false,
    },
  ];
};

const columnsWithIdsTmp = computed(() => {
  return columns.value
    .filter((column) => {
      const type = column.type;
      switch (type) {
        case 'axis':
          return column.spec.type !== 'Bytes';
        case 'column':
          return column.spec.valueType !== 'Bytes';
        default:
          throw Error(`unsupported data type: ${type satisfies never}`);
      }
    })
    .map((column) => ({
      column,
      id: makeColumnId(column),
    }))
    .filter((item) => item.id === selectedColumnIdForAdd.value);
});

const hasFilters = computed(() => reactiveModel.state.length > 0);

watch(
  () => selectedColumnIdForAdd.value,
  (columnId) => {
    if (columnId) {
      resetColumnFilterTmp(columnId);
    }
  },
  { deep: true, immediate: true },
);

function getNameForColId(columnId: PlTableFilterEntry['columnId']) {
  const colData = columnsWithIds.value.find((colData) => colData.id === columnId);
  return colData?.column.spec.annotations?.['pl7.app/label']?.trim() ?? 'Unlabeled ' + colData?.column.type;
}

function applyFilter() {
  if (selectedColumnIdForAdd.value) {
    const item = reactiveModelTmpForAdd.state.find((i) => i.columnId === selectedColumnIdForAdd.value);
    if (item) {
      reactiveModel.state.push(item);
    }
  }
  selectedColumnIdForAdd.value = undefined;
  reactiveModelTmpForAdd.state = [];
  showManagerAddFilters.value = false;
}

onMounted(() => {
  mounted.value = true;
});
</script>

<template>
  <Teleport v-if="mounted" :to="`#${PlAgDataTableToolsPanelId}`">
    <PlBtnGhost @click.stop="showManager = true">
      Filters
      <template #append>
        <PlIcon24 :name="hasFilters ? 'filter-on' : 'filter'" />
      </template>
    </PlBtnGhost>
  </Teleport>

  <PlSlideModal v-model="showManager" :close-on-outside-click="false">
    <template #title>Manage Filters</template>
    <PlAgDataTableFilterManager
      v-model="reactiveModel.state"
      :get-name-for-col-id="getNameForColId"
      :columns-with-ids="columnsWithIds"
      :filter-options="filterOptions"
      :make-wildcard-options="makeWildcardOptions"
      :parse-number="parseNumber"
      :parse-regex="parseRegex"
      :parse-string="parseString"
      :update-column-filter="updateColumnFilter"
      :reset-column-filter="resetColumnFilter"
      @add-filter="showManagerAddFilters = true"
    />
    <div v-if="!filterOptionsPresent">No filters applicable</div>
  </PlSlideModal>

  <PlSlideModal v-model="showManagerAddFilters" :close-on-outside-click="false">
    <template #title>Add Filter</template>
    <div class="d-flex gap-24 flex-column">
      <PlDropdown v-model="selectedColumnIdForAdd" :options="availableOption" label="Column" placeholder="Choose..." />

      <div v-if="!selectedColumnIdForAdd" class="text-subtitle-m" style="color: var(--txt-mask)">Choose a column to view and adjust its options</div>

      <div v-for="{ column, id } in columnsWithIdsTmp" :key="id">
        <div class="controls d-flex gap-24 flex-column" :class="{ open: !!reactiveModelTmpForAdd.state[0] }">
          <PlDropdown
            v-if="reactiveModelTmpForAdd.state[0]"
            :model-value="reactiveModelTmpForAdd.state[0]!.filter.type"
            :options="filterOptions[id]"
            label="Predicate"
            @update:model-value="(type) => updateColumnFilterTmp(id, type!)"
          />
          <template
            v-if="
              reactiveModelTmpForAdd.state[0]?.filter.type === 'number_equals' ||
              reactiveModelTmpForAdd.state[0]?.filter.type === 'number_notEquals' ||
              reactiveModelTmpForAdd.state[0]?.filter.type === 'number_lessThan' ||
              reactiveModelTmpForAdd.state[0]?.filter.type === 'number_lessThanOrEqualTo' ||
              reactiveModelTmpForAdd.state[0]?.filter.type === 'number_greaterThan' ||
              reactiveModelTmpForAdd.state[0]?.filter.type === 'number_greaterThanOrEqualTo'
            "
          >
            <PlTextField
              v-model="reactiveModelTmpForAdd.state[0].filter.reference"
              :parse="(value: string): number => parseNumber(column, value)"
              label="Reference value"
            />
          </template>
          <template v-if="reactiveModelTmpForAdd.state[0]?.filter.type === 'number_between'">
            <PlTextField
              v-model="reactiveModelTmpForAdd.state[0].filter.lowerBound"
              :parse="(value: string): number => parseNumber(column, value)"
              label="Lower bound"
            />
            <PlToggleSwitch v-model="reactiveModelTmpForAdd.state[0].filter.includeLowerBound" label="Include lower bound" />
            <PlTextField
              v-model="reactiveModelTmpForAdd.state[0].filter.upperBound"
              :parse="(value: string): number => parseNumber(column, value)"
              label="Upper bound"
            />
            <PlToggleSwitch v-model="reactiveModelTmpForAdd.state[0].filter.includeUpperBound" label="Include upper bound" />
          </template>
          <template
            v-if="
              reactiveModelTmpForAdd.state[0]?.filter.type === 'string_equals' ||
              reactiveModelTmpForAdd.state[0]?.filter.type === 'string_notEquals' ||
              reactiveModelTmpForAdd.state[0]?.filter.type === 'string_contains' ||
              reactiveModelTmpForAdd.state[0]?.filter.type === 'string_doesNotContain'
            "
          >
            <PlTextField
              v-model="reactiveModelTmpForAdd.state[0].filter.reference"
              :parse="(value: string): string => parseString(column, value)"
              label="Reference value"
            />
          </template>
          <template
            v-if="
              reactiveModelTmpForAdd.state[0]?.filter.type === 'string_matches' ||
              reactiveModelTmpForAdd.state[0]?.filter.type === 'string_doesNotMatch'
            "
          >
            <PlTextField v-model="reactiveModelTmpForAdd.state[0].filter.reference" :parse="parseRegex" label="Reference value" />
          </template>
          <template v-if="reactiveModelTmpForAdd.state[0]?.filter.type === 'string_containsFuzzyMatch'">
            <PlTextField
              v-model="reactiveModelTmpForAdd.state[0].filter.reference"
              :parse="(value: string): string => parseString(column, value)"
              label="Reference value"
            />
            <Slider
              v-model="reactiveModelTmpForAdd.state[0].filter.maxEdits"
              :max="5"
              breakpoints
              label="Maximum nuber of substitutions and indels"
            />
            <PlToggleSwitch v-model="reactiveModelTmpForAdd.state[0].filter.substitutionsOnly" label="Substitutions only" />
            <PlDropdown
              v-model="reactiveModelTmpForAdd.state[0].filter.wildcard"
              :options="makeWildcardOptions(column, reactiveModelTmpForAdd.state[0].filter.reference)"
              clearable
              label="Wildcard symbol"
            />
          </template>
        </div>
      </div>
    </div>
    <template #actions>
      <PlBtnPrimary :disabled="!selectedColumnIdForAdd" @click="applyFilter">Add Filter</PlBtnPrimary>
      <PlBtnGhost :justify-center="false" @click="showManagerAddFilters = false">Cancel</PlBtnGhost>
    </template>
  </PlSlideModal>
</template>

<style lang="css" scoped>
.controls {
  max-height: 0;
  transition: max-height 0.15s ease-out;
  overflow: hidden;
}
.controls.open {
  max-height: 500px;
  transition: max-height 0.25s ease-in;
  overflow: visible;
}
</style>
