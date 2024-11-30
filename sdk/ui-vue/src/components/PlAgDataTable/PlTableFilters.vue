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
  PlTableFiltersStateEntry,
  PlTableFilterColumnId,
} from '@platforma-sdk/model';
import * as lodash from 'lodash';
import type { PlTableFiltersDefault, PlTableFiltersRestriction } from './types';
import PlAgDataTableFilterManager from './PlAgDataTableFilterManager.vue';
import { PlAgDataTableToolsPanelId } from '../PlAgDataTableToolsPanel/PlAgDataTableToolsPanelId';
import './pl-table-filters.scss';

const model = defineModel<PlTableFiltersModel>({ required: true });
const props = defineProps<{
  columns: Readonly<PTableColumnSpec[]>;
  restrictions?: Readonly<PlTableFiltersRestriction[]>;
  defaults?: Readonly<PlTableFiltersDefault[]>;
}>();
const { columns, restrictions, defaults } = toRefs(props);

const makeColumnId = (column: PTableColumnId | PTableColumnSpec): PlTableFilterColumnId => canonicalize(column.id)!;

(() => {
  let state = model.value.state;
  if (!!state && typeof state === 'object' && !Array.isArray(state)) {
    model.value.state = Object.entries(state as unknown as Record<PlTableFilterColumnId, PlTableFilter>).map(([id, filter]) => ({
      columnId: id,
      filter,
      disabled: false,
    }));
  }
})();

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
    const entry = lodash.find(restrictionsValue, (entry) => lodash.isEqual(entry.column.id, column.id));
    if (entry) map[id] = entry.allowedFilterTypes;
  }
  return map;
});
const defaultsMap = computed<Record<PlTableFilterColumnId, PlTableFiltersStateEntry>>(() => {
  const defaultsValue = defaults.value ?? [];
  const map: Record<PlTableFilterColumnId, PlTableFiltersStateEntry> = {};
  for (const [id, column] of Object.entries(columnsById.value)) {
    const entry = lodash.find(defaultsValue, (entry) => lodash.isEqual(entry.column.id, column.id));
    if (entry) map[id] = { columnId: id, filter: entry.default, disabled: false };
  }
  return map;
});

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
  () => columnsById.value,
  (columnsById) => {
    reactiveModel.state = reactiveModel.state.filter((entry) => !!columnsById[entry.columnId]);
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
const makeFilter = (columnId: string): PlTableFiltersStateEntry =>
  defaultsMap.value[columnId] ?? {
    columnId,
    filter: getFilterDefault(filterOptions.value[columnId][0].value),
    disabled: false,
  };
const resetFilter = (index: number) => {
  reactiveModel.state[index] = makeFilter(reactiveModel.state[index].columnId);
};
const changeFilterType = (filter: PlTableFiltersStateEntry, type: PlTableFilterType): PlTableFiltersStateEntry => ({
  columnId: filter.columnId,
  filter: getFilterDefault(type, getFilterReference(filter.filter)),
  disabled: filter.disabled,
});
const changeFilter = (index: number, type: PlTableFilterType): void => {
  reactiveModel.state[index] = changeFilterType(reactiveModel.state[index], type);
};
const deleteFilter = (index: number) => reactiveModel.state.splice(index, 1);

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

const makePredicate = (column: PTableColumnSpec, filter: PlTableFilter): SingleValuePredicateV2 => {
  const alphabetic =
    (column.type === 'column' ? column.spec.valueType : column.spec.type) === 'String' &&
    (column.spec.domain?.['pl7.app/alphabet'] ?? column.spec.annotations?.['pl7.app/alphabet']) !== undefined;
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
      return {
        operator: 'Equal',
        reference: filter.reference,
      };
    case 'string_equals':
      return {
        operator: alphabetic ? 'IEqual' : 'Equal',
        reference: filter.reference as string,
      };
    case 'number_notEquals':
      return {
        operator: 'Not',
        operand: {
          operator: 'Equal',
          reference: filter.reference,
        },
      };
    case 'string_notEquals':
      return {
        operator: 'Not',
        operand: {
          operator: alphabetic ? 'IEqual' : 'Equal',
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
        operator: alphabetic ? 'StringIContains' : 'StringContains',
        substring: filter.reference,
      };
    case 'string_doesNotContain':
      return {
        operator: 'Not',
        operand: {
          operator: alphabetic ? 'StringIContains' : 'StringContains',
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
        operator: alphabetic ? 'StringIContainsFuzzy' : 'StringContainsFuzzy',
        reference: filter.reference,
        maxEdits: filter.maxEdits,
        substitutionsOnly: filter.substitutionsOnly,
        wildcard: filter.wildcard,
      };
    default:
      throw Error(`unsupported filter type: ${type satisfies never}`);
  }
};
const makeFilters = (state: PlTableFiltersState): PTableRecordFilter[] =>
  state
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
    });

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

const showManager = ref(false);
const showManagerAddFilters = ref(false);

const newFilterColumnOptions = computed<ListOption<PlTableFilterColumnId>[]>(() =>
  Object.entries(Object.entries(columnsById.value))
    .filter(([_i, [id, _column]]) => filterOptions.value[id].length > 0)
    .filter(([_i, [id, _column]]) => !reactiveModel.state.some((entry) => entry.columnId === id))
    .map(([i, [id, column]]) => ({
      label: column.spec.annotations?.['pl7.app/label']?.trim() ?? 'Unlabeled ' + column.type + ' ' + i.toString(),
      value: id,
    })),
);

const newFilter = ref<PlTableFiltersStateEntry>();
const changeNewFilter = (type: PlTableFilterType): void => {
  newFilter.value = changeFilterType(newFilter.value!, type);
};

const newFilterColumnId = ref<string>();
watch(
  () => newFilterColumnId.value,
  (columnId) => {
    if (columnId) newFilter.value = makeFilter(columnId);
    else newFilter.value = undefined;
  },
  { immediate: true },
);

const applyFilter = () => {
  if (newFilter.value) {
    reactiveModel.state.push(newFilter.value);
    newFilterColumnId.value = undefined;
    showManagerAddFilters.value = false;
  }
};

const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});
</script>

<template>
  <Teleport v-if="mounted" :to="`#${PlAgDataTableToolsPanelId}`">
    <PlBtnGhost @click.stop="showManager = true">
      Filters
      <template #append>
        <PlIcon24 :name="reactiveModel.state.length > 0 ? 'filter-on' : 'filter'" />
      </template>
    </PlBtnGhost>
  </Teleport>

  <PlSlideModal v-model="showManager" :close-on-outside-click="false">
    <template #title>Manage Filters</template>
    <PlAgDataTableFilterManager
      v-model="reactiveModel.state"
      :columns-by-id="columnsById"
      :filter-options="filterOptions"
      :make-wildcard-options="makeWildcardOptions"
      :parse-number="parseNumber"
      :parse-regex="parseRegex"
      :parse-string="parseString"
      :change-filter="changeFilter"
      :reset-filter="resetFilter"
      :delete-filter="deleteFilter"
      @add-filter="showManagerAddFilters = true"
    />
    <div v-if="!filterOptionsPresent">No filters applicable</div>
  </PlSlideModal>

  <PlSlideModal v-model="showManagerAddFilters" :close-on-outside-click="false">
    <template #title>Add Filter</template>
    <div class="d-flex gap-24 flex-column">
      <PlDropdown v-model="newFilterColumnId" :options="newFilterColumnOptions" label="Column" placeholder="Choose..." />

      <div v-if="!newFilterColumnId" class="text-subtitle-m" style="color: var(--txt-mask)">Choose a column to view and adjust its options</div>

      <div v-if="!!newFilter" class="d-flex gap-24 flex-column">
        <PlDropdown
          :model-value="newFilter.filter.type"
          :options="filterOptions[newFilter.columnId]"
          label="Predicate"
          @update:model-value="(type) => changeNewFilter(type!)"
        />
        <template
          v-if="
            newFilter?.filter.type === 'number_equals' ||
            newFilter?.filter.type === 'number_notEquals' ||
            newFilter?.filter.type === 'number_lessThan' ||
            newFilter?.filter.type === 'number_lessThanOrEqualTo' ||
            newFilter?.filter.type === 'number_greaterThan' ||
            newFilter?.filter.type === 'number_greaterThanOrEqualTo'
          "
        >
          <PlTextField
            v-model="newFilter.filter.reference"
            :parse="(value: string): number => parseNumber(columnsById[newFilter!.columnId], value)"
            label="Reference value"
          />
        </template>
        <template v-if="newFilter?.filter.type === 'number_between'">
          <PlTextField
            v-model="newFilter.filter.lowerBound"
            :parse="(value: string): number => parseNumber(columnsById[newFilter!.columnId], value)"
            label="Lower bound"
          />
          <PlToggleSwitch v-model="newFilter.filter.includeLowerBound" label="Include lower bound" />
          <PlTextField
            v-model="newFilter.filter.upperBound"
            :parse="(value: string): number => parseNumber(columnsById[newFilter!.columnId], value)"
            label="Upper bound"
          />
          <PlToggleSwitch v-model="newFilter.filter.includeUpperBound" label="Include upper bound" />
        </template>
        <template
          v-if="
            newFilter?.filter.type === 'string_equals' ||
            newFilter?.filter.type === 'string_notEquals' ||
            newFilter?.filter.type === 'string_contains' ||
            newFilter?.filter.type === 'string_doesNotContain'
          "
        >
          <PlTextField
            v-model="newFilter.filter.reference"
            :parse="(value: string): string => parseString(columnsById[newFilter!.columnId], value)"
            label="Reference value"
          />
        </template>
        <template v-if="newFilter?.filter.type === 'string_matches' || newFilter?.filter.type === 'string_doesNotMatch'">
          <PlTextField v-model="newFilter.filter.reference" :parse="parseRegex" label="Reference value" />
        </template>
        <template v-if="newFilter?.filter.type === 'string_containsFuzzyMatch'">
          <PlTextField
            v-model="newFilter.filter.reference"
            :parse="(value: string): string => parseString(columnsById[newFilter!.columnId], value)"
            label="Reference value"
          />
          <Slider v-model="newFilter.filter.maxEdits" :max="5" breakpoints label="Maximum nuber of substitutions and indels" />
          <PlToggleSwitch v-model="newFilter.filter.substitutionsOnly" label="Substitutions only" />
          <PlDropdown
            v-model="newFilter.filter.wildcard"
            :options="makeWildcardOptions(columnsById[newFilter!.columnId], newFilter.filter.reference)"
            clearable
            label="Wildcard symbol"
          />
        </template>
      </div>
    </div>
    <template #actions>
      <PlBtnPrimary :disabled="!newFilterColumnId" @click="applyFilter">Add Filter</PlBtnPrimary>
      <PlBtnGhost :justify-center="false" @click="showManagerAddFilters = false">Cancel</PlBtnGhost>
    </template>
  </PlSlideModal>
</template>
