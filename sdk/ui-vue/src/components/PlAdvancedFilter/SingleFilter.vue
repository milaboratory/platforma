<script lang="ts" setup>
import { PlAutocomplete, PlAutocompleteMulti, PlDropdown, PlIcon16, PlNumberField, PlTextField, PlToggleSwitch, Slider } from '@milaboratories/uikit';
import type { AnchoredPColumnId, AxisFilterByIdx, AxisFilterValue, SUniversalPColumnId } from '@platforma-sdk/model';
import { isFilteredPColumn, parseColumnId, stringifyColumnId, type ListOptionBase } from '@platforma-sdk/model';
import { computed } from 'vue';
import { DEFAULT_FILTER_TYPE, DEFAULT_FILTERS, SUPPORTED_FILTER_TYPES } from './constants';
import OperandButton from './OperandButton.vue';
import type { Filter, Operand, PlAdvancedFilterColumnId, SourceOptionInfo } from './types';
import { getFilterInfo, getNormalizedSpec, isNumericFilter, isStringFilter } from './utils';

const filter = defineModel<Filter>('filter', { required: true });

const props = defineProps<{
  isLast: boolean;
  operand: Operand;
  enableDnd: boolean;
  columnOptions: SourceOptionInfo[];
  getSuggestOptions: (params: { columnId: PlAdvancedFilterColumnId; searchStr: string; axisIdx?: number }) =>
    ListOptionBase<string | number>[] | Promise<ListOptionBase<string | number>[]>;
  // @todo: can be optional
  getSuggestModel: (params: { columnId: PlAdvancedFilterColumnId; searchStr: string; axisIdx?: number }) =>
    ListOptionBase<string | number> | Promise<ListOptionBase<string | number>>;
  onDelete: (columnId: PlAdvancedFilterColumnId) => void;
  onChangeOperand: (op: Operand) => void;
}>();

async function getSuggestModelMultiFn(id: PlAdvancedFilterColumnId, v: string[], axisIdx?: number): Promise<ListOptionBase<string>[]> {
  return Promise.all(v.map((v) => props.getSuggestModel({ columnId: id, searchStr: v, axisIdx }) as Promise<ListOptionBase<string>>));
}
async function getSuggestModelSingleFn(id: PlAdvancedFilterColumnId, v: string, axisIdx?: number): Promise<ListOptionBase<string>> {
  return props.getSuggestModel({ columnId: id, searchStr: v, axisIdx }) as Promise<ListOptionBase<string>>;
}
async function getSuggestOptionsFn(id: PlAdvancedFilterColumnId, str: string, axisIdx?: number): Promise<ListOptionBase<string>[]> {
  return props.getSuggestOptions({ columnId: id, searchStr: str, axisIdx }) as Promise<ListOptionBase<string>[]>;
}

function changeFilterType() {
  const nextFilterInfo = getFilterInfo(filter.value.type);
  if (currentSpec.value && nextFilterInfo.supportedFor(currentSpec.value) && isNumericFilter(filter.value)) {
    // no extra changes, previous filter is compatible with new filter type
    return;
  } else if (currentSpec.value && nextFilterInfo.supportedFor(currentSpec.value) && isStringFilter(filter.value)) {
    // erase extra settings for string filter types, save only value and column (for example regex)
    filter.value = {
      ...DEFAULT_FILTERS[filter.value.type],
      value: filter.value.value,
      column: filter.value.column,
    } as Filter;
  } else {
    filter.value = {
      ...DEFAULT_FILTERS[filter.value.type],
      column: filter.value.column,
    };
  }
}

function changeSourceId(newSourceId?: PlAdvancedFilterColumnId) {
  if (!newSourceId) {
    return;
  }
  const newSourceInfo = props.columnOptions.find((v) => v.id === getSourceId(newSourceId));
  if (!newSourceInfo) {
    return;
  }
  const filterInfo = getFilterInfo(filter.value.type);
  const newSourceSpec = getNormalizedSpec(newSourceInfo?.spec);
  if (filterInfo.supportedFor(newSourceSpec)) { // don't do anything except update source id
    filter.value.column = newSourceId;
  } else { // reset to default filter which fits to any column
    filter.value = {
      ...DEFAULT_FILTERS[DEFAULT_FILTER_TYPE],
      column: newSourceId,
    };
  }
}

const inconsistentSourceSelected = computed(() => {
  const selectedOption = props.columnOptions.find((op) => op.id === getSourceId(filter.value.column));
  return selectedOption === undefined;
});
const sourceOptions = computed(() => {
  const options = props.columnOptions.map((v) => ({ value: v.id, label: v.label ?? v }));
  if (inconsistentSourceSelected.value) {
    options.unshift({ value: filter.value.column, label: 'Inconsistent value' });
  }
  return options;
});

function getSourceId(column: PlAdvancedFilterColumnId): PlAdvancedFilterColumnId {
  try {
    const parsedColumnId = parseColumnId(column as SUniversalPColumnId);
    if (isFilteredPColumn(parsedColumnId)) {
      return stringifyColumnId(parsedColumnId.source);
    } else {
      return column;
    }
  } catch {
    return column;
  }
}

// similar to FilteredPColumnId but source is stringified and axis filters can be undefined
type ColumnAsSourceAndFixedAxes = { source: PlAdvancedFilterColumnId; axisFiltersByIndex: Record<number, AxisFilterValue | undefined> };
function getColumnAsSourceAndFixedAxes(column: PlAdvancedFilterColumnId): ColumnAsSourceAndFixedAxes {
  const sourceId = getSourceId(column);
  const option = props.columnOptions.find((op) => op.id === sourceId);
  const axesToBeFixed = (option?.axesToBeFixed ?? []).reduce((res, item) => {
    res[item.idx] = undefined;
    return res;
  }, {} as Record<number, AxisFilterValue | undefined>);
  try {
    const parsedColumnId = parseColumnId(column as SUniversalPColumnId);
    if (isFilteredPColumn(parsedColumnId)) {
      return {
        source: sourceId,
        axisFiltersByIndex: parsedColumnId.axisFilters.reduce((res, item) => {
          res[item[0]] = item[1];
          return res;
        }, axesToBeFixed),
      };
    }
  } catch {
    return { source: column, axisFiltersByIndex: axesToBeFixed };
  }
  return { source: column, axisFiltersByIndex: axesToBeFixed };
}

function stringifyColumn(value: ColumnAsSourceAndFixedAxes): PlAdvancedFilterColumnId {
  if (Object.keys(value.axisFiltersByIndex).length === 0) {
    return value.source;
  }
  return stringifyColumnId({
    source: parseColumnId(value.source as SUniversalPColumnId) as AnchoredPColumnId,
    axisFilters: Object.entries(value.axisFiltersByIndex).map(([idx, value]) => [Number(idx), value] as AxisFilterByIdx),
  });
}

const columnAsSourceAndFixedAxes = computed({
  get: () => {
    return getColumnAsSourceAndFixedAxes(filter.value.column);
  },
  set: (value) => {
    filter.value.column = stringifyColumn(value);
  },
});
function updateAxisFilterValue(idx: number, value: AxisFilterValue | undefined) {
  columnAsSourceAndFixedAxes.value = {
    ...columnAsSourceAndFixedAxes.value,
    axisFiltersByIndex: { ...columnAsSourceAndFixedAxes.value.axisFiltersByIndex, [idx]: value } };
}

const currentOption = computed(() => props.columnOptions.find((op) => op.id === columnAsSourceAndFixedAxes.value.source));
const currentSpec = computed(() => currentOption.value?.spec ? getNormalizedSpec(currentOption.value.spec) : null);
const currentType = computed(() => currentSpec.value?.valueType);
const currentError = computed(() => Boolean(currentOption.value?.error) || inconsistentSourceSelected.value);

const filterTypesOptions = computed(() => [...SUPPORTED_FILTER_TYPES].filter((v) =>
  filter.value.type === v || (currentSpec.value ? getFilterInfo(v).supportedFor(currentSpec.value) : true),
).map((v) => ({ value: v, label: getFilterInfo(v).label })),
);

const wildcardOptions = computed(() => {
  if (filter.value.type === 'patternFuzzyContainSubsequence') {
    if (currentOption.value?.alphabet === 'nucleotide') {
      return [{ label: 'N', value: 'N' }];
    }
    if (currentOption.value?.alphabet === 'aminoacid') {
      return [{ label: 'X', value: 'X' }];
    }
    return [...new Set(filter.value.value.split(''))].sort().map((v) => ({ value: v, label: v }));
  }
  return [];
});

const stringMatchesError = computed(() => {
  if (filter.value.type !== 'patternMatchesRegularExpression') {
    return false;
  }
  try {
    new RegExp(filter.value.value);
    return false;
  } catch {
    return true;
  }
});

</script>
<template>
  <div :class="$style.filterWrapper">
    <!-- top element - column selector / column label - for all filter types-->
    <div v-if="enableDnd" :class="[$style.top, $style.columnChip, {[$style.error]: currentError}]">
      <div :class="[$style.typeIcon, {[$style.error]: currentError}]">
        <PlIcon16 v-if="currentError" name="warning"/>
        <PlIcon16 v-else :name="currentType === 'String' || currentType === undefined ? 'cell-type-txt' : 'cell-type-num'"/>
      </div>
      <div :class="$style.titleWrapper" :title="currentOption?.label ?? ''">
        <div :class="$style.title">
          {{ inconsistentSourceSelected ? 'Inconsistent value' : currentOption?.label ?? filter.column }}
        </div>
      </div>
      <div :class="$style.closeIcon" @click="onDelete(filter.column)">
        <PlIcon16 name="close"/>
      </div>
    </div>
    <div v-else :class="$style.top" >
      <PlDropdown
        v-model="columnAsSourceAndFixedAxes.source"
        :errorStatus="currentError"
        :options="sourceOptions"
        :style="{width: '100%'}"
        group-position="top-left"
        @update:model-value="changeSourceId"
      />
      <div :class="$style.closeButton" @click="onDelete(filter.column)">
        <PlIcon16 name="close"/>
      </div>
    </div>

    <div v-if="currentOption?.axesToBeFixed?.length" :class="$style.fixedAxesBlock">
      <template v-for="value in currentOption?.axesToBeFixed" :key="value.idx">
        <PlAutocomplete
          v-model="columnAsSourceAndFixedAxes.axisFiltersByIndex[value.idx]"
          :label="value.label"
          :options-search="(str) => getSuggestOptionsFn(columnAsSourceAndFixedAxes.source, str, value.idx)"
          :model-search="(v) => getSuggestModelSingleFn(columnAsSourceAndFixedAxes.source, String(v), value.idx)"
          :disabled="inconsistentSourceSelected"
          :clearable="true"
          @update:model-value="(v) => updateAxisFilterValue(value.idx, v)"
        />
      </template>
    </div>

    <!-- middle - filter type selector -  for all filter types -->
    <div :class="filter.type === 'isNA' || filter.type === 'isNotNA' ? $style.bottom : $style.middle">
      <PlDropdown
        v-model="filter.type"
        :options="filterTypesOptions"
        :group-position="filter.type === 'isNA' || filter.type === 'isNotNA' ? 'bottom' : 'middle'"
        @update:model-value="changeFilterType"
      />
    </div>

    <!-- middle - for fuzzy contains filter -->
    <template v-if="filter.type === 'patternFuzzyContainSubsequence'">
      <div :class="$style.middle">
        <PlTextField
          v-model="filter.value"
          placeholder="Substring"
          group-position="middle"
        />
      </div>
      <div :class="$style.innerSection">
        <Slider
          v-model="filter.maxEdits"
          :max="5"
          breakpoints label="Maximum number of substitutions and indels"
        />
        <PlToggleSwitch
          v-model="filter.substitutionsOnly"
          label="Substitutions only"
        />
      </div>
    </template>

    <!-- bottom element - individual settings for every filter type -->
    <div :class="$style.bottom">
      <template v-if="filter.type === 'patternEquals' || filter.type === 'patternNotEquals'" >
        <PlAutocomplete
          v-model="filter.value"
          :options-search="(str) => getSuggestOptionsFn(columnAsSourceAndFixedAxes.source, str)"
          :model-search="(v) => getSuggestModelSingleFn(columnAsSourceAndFixedAxes.source, v as string)"
          :disabled="inconsistentSourceSelected"
          :clearable="true"
          group-position="bottom"
        />
      </template>
      <template v-if="filter.type === 'inSet' || filter.type === 'notInSet'" >
        <PlAutocompleteMulti
          v-model="filter.value"
          :options-search="(str) => getSuggestOptionsFn(columnAsSourceAndFixedAxes.source, str)"
          :model-search="(v) => getSuggestModelMultiFn(columnAsSourceAndFixedAxes.source, v as string[])"
          :disabled="inconsistentSourceSelected"
          group-position="bottom"
        />
      </template>
      <PlNumberField
        v-if="isNumericFilter(filter)"
        v-model="filter.x"
        group-position="bottom"
      />
      <PlTextField
        v-if="filter.type === 'patternContainSubsequence' || filter.type === 'patternNotContainSubsequence'"
        v-model="filter.value"
        placeholder="Substring"
        group-position="bottom"
      />
      <PlTextField
        v-if="filter.type === 'patternMatchesRegularExpression'"
        v-model="filter.value"
        :error="stringMatchesError ? 'Regular expression is not valid' : undefined"
        placeholder="Regular expression"
        group-position="bottom"
      />
      <PlDropdown
        v-if="filter.type === 'patternFuzzyContainSubsequence'"
        v-model="filter.wildcard"
        clearable
        placeholder="Wildcard value"
        :options="wildcardOptions"
        group-position="bottom"
      />
    </div>
  </div>
  <OperandButton
    :class="$style.buttonWrapper"
    :active="operand"
    :disabled="isLast"
    :on-select="onChangeOperand"
  />
</template>

<style module>
.filterWrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  margin-bottom: 8px;
  width: 100%;
  cursor: default;
}

.typeIcon {
  display: inline-flex;
  margin-right: 8px;
}

.typeIcon.error {
  --icon-color: var(--txt-error);
}

.closeIcon {
  display: inline-flex;
  margin-left: 12px;
  cursor: pointer;
}

.titleWrapper {
  flex-grow: 1;
  overflow: hidden;
}
.title {
  overflow: hidden;
  color: var(--txt-01);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
}

.columnChip {
  width: 100%;
  display: flex;
  padding: 10px 12px;
  align-items: center;
  border-radius: 6px;
  border: 1px solid var(--txt-01);
  border-bottom-right-radius: 0;
  border-bottom-left-radius: 0;

  &.error {
    border-color: var(--txt-error);
  }
}

.innerSection {
  border: 1px solid var(--txt-01);
  border-top: none;
  padding: 16px 12px;
}

.closeButton {
  border: 1px solid var(--txt-01);
  border-top-right-radius: 6px;
  border-left: none;
  width: 40px;
  height: 40px;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
  cursor: pointer;
}

.top {
  position: relative;
  display: flex;
  width: 100%;
  z-index: 1;
  background: #fff;
}

.fixedAxesBlock {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 12px 8px;
  gap: 12px;
  border-left: 1px solid var(--txt-01);
  border-right: 1px solid var(--txt-01);
}

.fixedAxesBlock > * {
  background: #fff;
}

.middle, .bottom {
  position: relative;
  margin-top: -1px;
  background: #fff;
}

.buttonWrapper {
  margin-bottom: 8px;
}
</style>
