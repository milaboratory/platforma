<script lang="ts" setup>
import type { Filter, FilterType, Operand, SourceOptionInfo } from './types';
import { PlIcon16, PlDropdown, PlAutocomplete, PlAutocompleteMulti, PlTextField, PlNumberField, Slider, PlToggleSwitch } from '@milaboratories/uikit';
import { computed } from 'vue';
import { SUPPORTED_FILTER_TYPES, DEFAULT_FILTER_TYPE, DEFAULT_FILTERS } from './constants';
import type { AnchoredPColumnId, AxisFilterByIdx, AxisFilterValue, SUniversalPColumnId } from '@platforma-sdk/model';
import { isFilteredPColumn, parseColumnId, stringifyColumnId, type ListOptionBase } from '@platforma-sdk/model';
import OperandButton from './OperandButton.vue';
import { getFilterInfo, getNormalizedSpec, isNumericValueType } from './utils';

const props = defineProps<{
  operand: Operand;
  columnOptions: SourceOptionInfo[];
  dndMode: boolean;
  last: boolean;
  searchOptions: (columnId: SUniversalPColumnId, searchStr: string, axisIdx?: number) => (Promise<ListOptionBase<string | number>[]>) |
    ((columnId: SUniversalPColumnId, searchStr: string, axisIdx?: number) => ListOptionBase<string | number>[]);
  searchModel: (columnId: SUniversalPColumnId, searchStr: string, axisIdx?: number) => (Promise<ListOptionBase<string | number>>) |
    ((columnId: SUniversalPColumnId, searchStr: string, axisIdx?: number) => ListOptionBase<string | number>);
  onDelete: (columnId: SUniversalPColumnId) => void;
  onChangeOperand: (op: Operand) => void;
}>();

const filter = defineModel<Filter>({ required: true });

async function searchModelMultiFn(id: SUniversalPColumnId, v: string[], axisIdx?: number): Promise<ListOptionBase<string>[]> {
  const searchFn = props.searchModel;
  return Promise.all(v.map((v) => searchFn(id, v, axisIdx) as Promise<ListOptionBase<string>>));
}
async function searchModelSingleFn(id: SUniversalPColumnId, v: string, axisIdx?: number): Promise<ListOptionBase<string>> {
  const searchFn = props.searchModel;
  return searchFn(id, v, axisIdx) as Promise<ListOptionBase<string>>;
}
async function searchOptionsFn(id: SUniversalPColumnId, str: string, axisIdx?: number): Promise<ListOptionBase<string>[]> {
  const searchFn = props.searchOptions;
  return searchFn(id, str, axisIdx) as Promise<ListOptionBase<string>[]>;
}

function changeFilterType(newFilterType?: FilterType) {
  if (!newFilterType) {
    return;
  }
  const nextFilterInfo = getFilterInfo(newFilterType);
  if (currentSpec.value && nextFilterInfo.supportedFor(currentSpec.value) && isNumericValueType(currentOption.value?.info.spec)) {
    filter.value = {
      ...filter.value,
      column: filter.value.column,
    };
  } else if (
    currentSpec.value && nextFilterInfo.supportedFor(currentSpec.value) && 'substring' in filter.value && 'substring' in DEFAULT_FILTERS[newFilterType]
  ) {
    filter.value = {
      ...filter.value,
      column: filter.value.column,
    };
  } else {
    filter.value = {
      ...DEFAULT_FILTERS[newFilterType],
      column: filter.value.column,
    };
  }
}

function changeSourceId(newSourceId?: SUniversalPColumnId) {
  console.log('changeSourceId', newSourceId);
  if (!newSourceId) {
    return;
  }
  const newSourceInfo = props.columnOptions.find((v) => v.id === getSourceId(newSourceId));
  if (!newSourceInfo) {
    console.log('newSourceInfo not found', newSourceId);
    return;
  }
  const filterInfo = getFilterInfo(filter.value.type);
  const newSourceSpec = getNormalizedSpec(newSourceInfo?.info?.spec);
  if (filterInfo.supportedFor(newSourceSpec)) { // don't do anything except update source id
    filter.value.column = newSourceId;
  } else { // reset to default filter which fits to any column
    console.log('reset to default filter', newSourceId);
    filter.value = {
      ...DEFAULT_FILTERS[DEFAULT_FILTER_TYPE],
      column: newSourceId,
    };
  }
}

const inconsistentSourceSelected = computed(() => !props.columnOptions.find((op) => op.id === getSourceId(filter.value.column)));
const sourceOptions = computed(() => {
  const options = props.columnOptions.map((v) => ({ value: v.id, label: v.info.label ?? v }));
  if (inconsistentSourceSelected.value) {
    options.unshift({ value: filter.value.column, label: 'Inconsistent value' });
  }
  return options;
});

function getSourceId(column: SUniversalPColumnId): SUniversalPColumnId {
  try {
    const parsedColumnId = parseColumnId(column);
    if (isFilteredPColumn(parsedColumnId)) {
      return typeof parsedColumnId.source === 'string' ? parsedColumnId.source : stringifyColumnId(parsedColumnId.source);
    }
  } catch {
    return column;
  }
  return column;
}
type ColumnAsSourceAndFixedAxes = { column: SUniversalPColumnId; axisFiltersByIndex: Record<number, AxisFilterValue | undefined> };
function getColumnAsSourceAndFixedAxes(column: SUniversalPColumnId): ColumnAsSourceAndFixedAxes {
  const sourceId = getSourceId(column);
  const option = props.columnOptions.find((op) => op.id === sourceId);
  const axesToBeFixed = (option?.info.axesToBeFixed ?? []).reduce((res, item) => {
    res[item.idx] = undefined;
    return res;
  }, {} as Record<number, AxisFilterValue | undefined>);
  try {
    const parsedColumnId = parseColumnId(column);
    if (isFilteredPColumn(parsedColumnId)) {
      return {
        column: sourceId,
        axisFiltersByIndex: parsedColumnId.axisFilters.reduce((res, item) => {
          res[item[0]] = item[1];
          return res;
        }, axesToBeFixed),
      };
    }
  } catch {
    return { column: column, axisFiltersByIndex: axesToBeFixed };
  }
  return { column: column, axisFiltersByIndex: axesToBeFixed };
}

function stringifyColumn(value: ColumnAsSourceAndFixedAxes): SUniversalPColumnId {
  if (Object.keys(value.axisFiltersByIndex).length === 0) {
    return value.column;
  }
  return stringifyColumnId({
    source: value.column as unknown as AnchoredPColumnId,
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

const currentOption = computed(() => props.columnOptions.find((op) => op.id === columnAsSourceAndFixedAxes.value.column));
const currentSpec = computed(() => currentOption.value?.info.spec ? getNormalizedSpec(currentOption.value.info.spec) : null);
const currentType = computed(() => currentSpec.value?.valueType);
const currentError = computed(() => currentOption.value?.info.error || inconsistentSourceSelected.value);

const filterTypesOptions = computed(() => [...SUPPORTED_FILTER_TYPES].filter((v) =>
  filter.value.type === v || (currentSpec.value ? getFilterInfo(v).supportedFor(currentSpec.value) : true),
).map((v) => ({ value: v, label: getFilterInfo(v).label })),
);

const wildcardOptions = computed(() => {
  if (filter.value.type === 'patternFuzzyContainSubsequence') {
    if (currentOption.value?.info.alphabet === 'nucleotide') {
      return [{ label: 'N', value: 'N' }];
    }
    if (currentOption.value?.info.alphabet === 'aminoacid') {
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
    <div v-if="dndMode" :class="[$style.top, $style.columnChip, {[$style.error]: currentError}]">
      <div :class="[$style.typeIcon, {[$style.error]: currentError}]">
        <PlIcon16 v-if="currentError" name="warning"/>
        <PlIcon16 v-else :name="currentType === 'String' || currentType === undefined? 'cell-type-txt' : 'cell-type-num'"/>
      </div>
      <div :class="$style.titleWrapper" :title="currentOption?.info.label ?? ''">
        <div :class="$style.title">
          {{ inconsistentSourceSelected ? 'Inconsistent value' : currentOption?.info.label ?? filter.column }}
        </div>
      </div>
      <div :class="$style.closeIcon" @click="onDelete(filter.column)">
        <PlIcon16 name="close"/>
      </div>
    </div>
    <div v-else :class="$style.top" >
      <PlDropdown
        v-model="columnAsSourceAndFixedAxes.column"
        :errorStatus="currentError"
        :options="sourceOptions"
        :style="{width: '100%'}"
        position="top-left"
        @update:model-value="changeSourceId"
      />
      <div :class="$style.closeButton" @click="onDelete(filter.column)">
        <PlIcon16 name="close"/>
      </div>
    </div>

    <div v-if="currentOption?.info.axesToBeFixed?.length" :class="$style.fixedAxesBlock">
      <template v-for="value in currentOption?.info.axesToBeFixed" :key="value.idx">
        <PlAutocomplete
          v-model="columnAsSourceAndFixedAxes.axisFiltersByIndex[value.idx]"
          :label="value.label"
          :options-search="(str) => searchOptionsFn(columnAsSourceAndFixedAxes.column, str, value.idx)"
          :model-search="(v) => searchModelSingleFn(columnAsSourceAndFixedAxes.column, v as string, value.idx)"
          :disabled="inconsistentSourceSelected"
          :clearable="true"
          @update:model-value="(v) => {
            columnAsSourceAndFixedAxes = {
              ...columnAsSourceAndFixedAxes,
              axisFiltersByIndex: {...columnAsSourceAndFixedAxes.axisFiltersByIndex, [value.idx]: v}}
          }"
        />
      </template>
    </div>

    <!-- middle - filter type selector -  for all filter types -->
    <div :class="filter.type === 'isNA' || filter.type === 'isNotNA' ? $style.bottom : $style.middle">
      <PlDropdown
        v-model="filter.type"
        :options="filterTypesOptions"
        :position="filter.type === 'isNA' || filter.type === 'isNotNA' ? 'bottom' : 'middle'"
        @update:model-value="changeFilterType"
      />
    </div>

    <!-- middle - for fuzzy contains filter -->
    <template v-if="filter.type === 'patternFuzzyContainSubsequence'">
      <div :class="$style.middle">
        <PlTextField
          v-model="filter.value"
          placeholder="Substring"
          position="middle"
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
          :options-search="(str) => searchOptionsFn(columnAsSourceAndFixedAxes.column, str)"
          :model-search="(v) => searchModelSingleFn(columnAsSourceAndFixedAxes.column, v as string)"
          :disabled="inconsistentSourceSelected"
          :clearable="true"
          position="bottom"
        />
      </template>
      <template v-if="filter.type === 'inSet' || filter.type === 'notInSet'" >
        <PlAutocompleteMulti
          v-model="filter.value"
          :options-search="(str) => searchOptionsFn(columnAsSourceAndFixedAxes.column, str)"
          :model-search="(v) => searchModelMultiFn(columnAsSourceAndFixedAxes.column, v as string[])"
          :disabled="inconsistentSourceSelected"
          position="bottom"
        />
      </template>
      <PlNumberField
        v-if="'x' in filter"
        v-model="filter.x"
        position="bottom"
      />
      <PlTextField
        v-if="filter.type === 'patternContainSubsequence' || filter.type === 'patternNotContainSubsequence'"
        v-model="filter.value"
        placeholder="Substring"
        position="bottom"
      />
      <PlTextField
        v-if="filter.type === 'patternMatchesRegularExpression'"
        v-model="filter.value"
        :error="stringMatchesError ? 'Regular expression is not valid' : undefined"
        placeholder="Regular expression"
        position="bottom"
      />
      <PlDropdown
        v-if="filter.type === 'patternFuzzyContainSubsequence'"
        v-model="filter.wildcard"
        clearable
        placeholder="Wildcard value"
        :options="wildcardOptions"
        position="bottom"
      />
    </div>
  </div>
  <div :class="$style.buttonWrapper">
    <OperandButton
      :active="operand"
      :disabled="last"
      @select="onChangeOperand"
    />
  </div>
</template>

<style lang="scss" module>
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

  &.error {
   --icon-color: var(--txt-error);
  }
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
