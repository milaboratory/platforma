<script lang="ts" setup>
import type { ListOption } from '@milaboratories/uikit';
import { PlCheckbox, PlDropdown, PlNumberField, PlTextField, PlToggleSwitch, Slider } from '@milaboratories/uikit';
import { computed, reactive, toRefs, watch } from 'vue';
import canonicalize from 'canonicalize';
import type {
  PlTableFiltersModel,
  PTableRecordFilter,
  SingleValuePredicate,
  PlTableFilterType,
  PlTableFilterNumberType,
  PlTableFilterStringType,
  PlTableFilter,
  PTableColumnSpec,
  PTableColumnId,
} from '@platforma-sdk/model';
import * as lodash from 'lodash';
import type { PlTableFiltersDefault, PlTableFiltersRestriction } from './types';

const model = defineModel<PlTableFiltersModel>({ required: true });
const props = defineProps<{
  columns: Readonly<PTableColumnSpec[]>;
  restrictions?: Readonly<PlTableFiltersRestriction[]>;
  defaults?: Readonly<PlTableFiltersDefault[]>;
}>();
const { columns, restrictions, defaults } = toRefs(props);

const makeColumnId = (column: PTableColumnId | PTableColumnSpec): string => canonicalize(column.id)!;
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
  const map: Record<string, PlTableFilter> = {};
  for (const { column, id } of columnsWithIds.value) {
    const entry = lodash.find(defaultsValue, (entry) => lodash.isEqual(entry.column.id, column.id));
    if (entry !== undefined) {
      map[id] = entry.default;
    }
  }
  return map;
});

const makeState = (state?: Record<string, PlTableFilter>): Record<string, PlTableFilter> => {
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

    const currentState = reactiveModel.state ?? {};
    const newState: Record<string, PlTableFilter> = {};
    for (const { id } of columnsWithIds) {
      if (currentState[id] !== undefined) newState[id] = currentState[id];
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
    case 'number_greaterThen':
      return 'Greater then';
    case 'number_greaterThenOrEqualTo':
      return 'Greater then or equal to';
    case 'number_lessThen':
      return 'Less then';
    case 'number_lessThenOrEqualTo':
      return 'Less then or equal to';
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
  'number_greaterThen',
  'number_greaterThenOrEqualTo',
  'number_lessThen',
  'number_lessThenOrEqualTo',
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
    case 'number_greaterThen':
    case 'number_greaterThenOrEqualTo':
    case 'number_lessThen':
    case 'number_lessThenOrEqualTo':
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
    case 'number_greaterThen':
    case 'number_greaterThenOrEqualTo':
    case 'number_lessThen':
    case 'number_lessThenOrEqualTo':
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
  const prevFilter = reactiveModel.state![columnId];
  reactiveModel.state![columnId] = getFilterDefault(type, getFilterReference(prevFilter));
};
const onFilterActiveChanged = (columnId: string, checked: boolean) => {
  if (checked) {
    reactiveModel.state![columnId] = defaultsMap.value[columnId] ?? getFilterDefault(filterOptions.value[columnId][0].value);
  } else {
    delete reactiveModel.state![columnId];
  }
};

const makeWildcardOptions = (reference: string) => {
  const chars = lodash.uniq(reference);
  chars.sort();
  return chars.map((char) => ({
    value: char,
    text: char,
  }));
};

const makePredicate = (filter: PlTableFilter): SingleValuePredicate => {
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
    case 'number_greaterThen':
      return {
        operator: 'Greater',
        reference: filter.reference,
      };
    case 'number_greaterThenOrEqualTo':
      return {
        operator: 'GreaterOrEqual',
        reference: filter.reference,
      };
    case 'number_lessThen':
      return {
        operator: 'Less',
        reference: filter.reference,
      };
    case 'number_lessThenOrEqualTo':
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
const makeFilters = (state: Record<string, PlTableFilter>): PTableRecordFilter[] => {
  return columnsWithIds.value
    .map(({ column, id }) => {
      if (!(id in state)) return undefined;

      const predicate = makePredicate(state[id]);
      const { spec, ...columnId } = column;
      const _ = spec;

      return {
        type: 'bySingleColumn',
        column: columnId,
        predicate,
      } satisfies PTableRecordFilter;
    })
    .filter((entry) => entry !== undefined);
};

// Should this happen on Apply button click instead?
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
</script>

<template>
  <div v-for="({ column, id }, i) in columnsWithIds" :key="id">
    <form v-if="filterOptions[id].length > 0" class="d-flex gap-10 flex-column">
      <PlCheckbox :model-value="!!reactiveModel.state[id]" @update:model-value="(checked) => onFilterActiveChanged(id, checked)">
        {{ column.spec.annotations?.['pl7.app/label']?.trim() ?? 'Unlabeled ' + column.type + ' ' + i.toString() }}
      </PlCheckbox>
      <div class="controls d-flex gap-10 flex-column" :class="{ open: !!reactiveModel.state[id] }">
        <PlDropdown
          v-if="reactiveModel.state[id]"
          :model-value="reactiveModel.state[id]!.type"
          :options="filterOptions[id]"
          label="Predicate"
          @update:model-value="(type) => updateColumnFilter(id, type!)"
        />
        <template
          v-if="
            reactiveModel.state[id]?.type === 'number_equals' ||
            reactiveModel.state[id]?.type === 'number_notEquals' ||
            reactiveModel.state[id]?.type === 'number_lessThen' ||
            reactiveModel.state[id]?.type === 'number_lessThenOrEqualTo' ||
            reactiveModel.state[id]?.type === 'number_greaterThen' ||
            reactiveModel.state[id]?.type === 'number_greaterThenOrEqualTo'
          "
        >
          <PlNumberField v-model="reactiveModel.state[id].reference" label="Reference value" />
        </template>
        <template v-if="reactiveModel.state[id]?.type === 'number_between'">
          <PlNumberField v-model="reactiveModel.state[id].lowerBound" label="Lower bound" />
          <PlToggleSwitch v-model="reactiveModel.state[id].includeLowerBound" label="Include lower bound" />
          <PlNumberField v-model="reactiveModel.state[id].upperBound" label="Upper bound" />
          <PlToggleSwitch v-model="reactiveModel.state[id].includeUpperBound" label="Include upper bound" />
        </template>
        <template
          v-if="
            reactiveModel.state[id]?.type === 'string_equals' ||
            reactiveModel.state[id]?.type === 'string_notEquals' ||
            reactiveModel.state[id]?.type === 'string_contains' ||
            reactiveModel.state[id]?.type === 'string_doesNotContain' ||
            reactiveModel.state[id]?.type === 'string_matches' ||
            reactiveModel.state[id]?.type === 'string_doesNotMatch'
          "
        >
          <PlTextField v-model="reactiveModel.state[id].reference" label="Reference value" />
        </template>
        <template v-if="reactiveModel.state[id]?.type === 'string_containsFuzzyMatch'">
          <PlTextField v-model="reactiveModel.state[id].reference" label="Reference value" />
          <Slider v-model="reactiveModel.state[id].maxEdits" :max="5" breakpoints label="Maximum nuber of substitutions and indels" />
          <PlToggleSwitch v-model="reactiveModel.state[id].substitutionsOnly" label="Substitutions only" />
          <PlDropdown
            v-model="reactiveModel.state[id].wildcard"
            :options="makeWildcardOptions(reactiveModel.state[id].reference)"
            clearable
            label="Wildcard symbol"
          />
        </template>
      </div>
    </form>
  </div>
  <div v-if="!filterOptionsPresent">No filters applicable</div>
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
