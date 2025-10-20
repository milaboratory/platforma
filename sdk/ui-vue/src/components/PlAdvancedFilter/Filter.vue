<script lang="ts" setup>
import type { Filter, FilterType, Operand, SourceOptionInfo } from './types';
import { PlIcon16, PlDropdown, PlDropdownMulti, PlAutocomplete, PlAutocompleteMulti, PlTextField, PlNumberField, Slider, PlToggleSwitch } from '@milaboratories/uikit';
import { computed } from 'vue';
import { ALL_FILTER_TYPES, DEFAULT_FILTER_TYPE, DEFAULT_FILTERS } from './constants';
import { type ListOptionBase } from '@platforma-sdk/model';
import OperandButton from './OperandButton.vue';
import { getFilterInfo, getNormalizedSpec, isNumericValueType, isStringValueType } from './utils';

const props = defineProps<{
  operand: Operand;
  columnOptions: SourceOptionInfo[];
  dndMode: boolean;
  last: boolean;
  searchOptionsFn?: (id: string, str: string) => (Promise<ListOptionBase<string | number>[]>) | ((id: string, str: string) => ListOptionBase<string | number>[]);
  searchModelFn?: (id: string, str: string) => (Promise<ListOptionBase<string | number>>) | ((id: string, str: string) => ListOptionBase<string | number>);
  onDelete: (id: string) => void;
  onChangeOperand: (op: Operand) => void;
}>();

const filter = defineModel<Filter>({ required: true });

async function searchModelMulti(id: string, v: string[]): Promise<ListOptionBase<string>[]> {
  const searchFn = props.searchModelFn;
  return Promise.all(v.map((v) => searchFn ? searchFn(id, v) as Promise<ListOptionBase<string>> : Promise.resolve({ label: '', value: '' })));
}
async function searchModel(id: string, v: string): Promise<ListOptionBase<string>> {
  const searchFn = props.searchModelFn;
  return searchFn ? searchFn(id, v) as Promise<ListOptionBase<string>> : Promise.resolve({ label: '', value: '' });
}
async function searchOptions(id: string, str: string): Promise<ListOptionBase<string>[]> {
  const searchFn = props.searchOptionsFn;
  return searchFn ? searchFn(id, str) as Promise<ListOptionBase<string>[]> : Promise.resolve([]);
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

function changeSourceId(newSourceId?: string) {
  if (!newSourceId) {
    return;
  }
  const newSourceInfo = props.columnOptions.find((v) => v.id === newSourceId);
  if (!newSourceInfo) {
    return;
  }
  const filterInfo = getFilterInfo(filter.value.type);
  const newSourceSpec = getNormalizedSpec(newSourceInfo?.info?.spec);
  if (filterInfo.supportedFor(newSourceSpec)) { // don't do anything except update source id
    return;
  } else { // new source id doesn't fit current filter by type (string/number), reset to default filter
    filter.value = {
      ...DEFAULT_FILTERS[DEFAULT_FILTER_TYPE],
      column: filter.value.column,
    };
  }
}

const inconsistentSourceSelected = computed(() => !props.columnOptions.find((op) => op.id === filter.value.column));
const sourceOptions = computed(() => {
  const options = props.columnOptions.map((v) => ({ value: v.id, label: v.info.label ?? v }));
  if (inconsistentSourceSelected.value) {
    options.unshift({ value: filter.value.column, label: 'Inconsistent value' });
  }
  return options;
});

const currentOption = computed(() => props.columnOptions.find((op) => op.id === filter.value.column));
const currentSpec = computed(() => currentOption.value?.info.spec ? getNormalizedSpec(currentOption.value.info.spec) : null);
const currentType = computed(() => currentSpec.value?.valueType);
const currentError = computed(() => currentOption.value?.info.error || inconsistentSourceSelected.value);

const filterTypesOptions = computed(() => [...ALL_FILTER_TYPES].filter((v) =>
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

const preloadedOptions = computed(() => {
  if (!isStringValueType(currentOption.value?.info.spec) || inconsistentSourceSelected.value) {
    return null;
  }
  if (filter.value.type !== 'patternEquals' && filter.value.type !== 'patternNotEquals' && filter.value.type !== 'inSet' && filter.value.type !== 'notInSet') {
    return null;
  }
  const uniqueValues = currentOption.value?.info.uniqueValues;
  if (uniqueValues) {
    return uniqueValues;
  }
  if (props.searchOptionsFn && props.searchModelFn) {
    return null;
  }
  return undefined;
});

function isNumberType(v: Filter): v is Filter & { type: 'numberEquals' | 'numberNotEquals' | 'lessThan' | 'lessThanOrEqual' | 'greaterThan' | 'greaterThanOrEqual' } {
  return v.type === 'numberEquals' || v.type === 'numberNotEquals'
    || v.type === 'lessThan'
    || v.type === 'lessThanOrEqual'
    || v.type === 'greaterThan'
    || v.type === 'greaterThanOrEqual';
}
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
        v-model="filter.column"
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
      <template v-for="value in currentOption?.info.axesToBeFixed">
        <PlDropdown
          v-if="value.info.uniqueValues !== null"
          :key="value.id"
          v-model="filter.fixedAxes[value.id]"
          :label="value.info.label"
          :options="value.info.uniqueValues"
          :clearable="true"
        />
        <PlAutocomplete
          v-else
          :key="value.id + 'autocomplete'"
          v-model="filter.fixedAxes[value.id]"
          :label="value.info.label"
          :options-search="(str) => searchOptions(filter.column, str)"
          :model-search="(v) => searchModel(filter.column, v as string)"
          :disabled="inconsistentSourceSelected"
          :clearable="true"
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
        <PlDropdown
          v-if="preloadedOptions !== null"
          v-model="filter.value"
          :options="preloadedOptions"
          :disabled="inconsistentSourceSelected"
          :clearable="true"
          position="bottom"
        />
        <PlAutocomplete
          v-else
          v-model="filter.value"
          :options-search="(str) => searchOptions(filter.column, str)"
          :model-search="(v) => searchModel(filter.column, v as string)"
          :disabled="inconsistentSourceSelected"
          :clearable="true"
          position="bottom"
        />
      </template>
      <template v-if="filter.type === 'inSet' || filter.type === 'notInSet'" >
        <PlDropdownMulti
          v-if="preloadedOptions !== null"
          v-model="filter.value"
          :options="preloadedOptions"
          :disabled="inconsistentSourceSelected"
          position="bottom"
        />
        <PlAutocompleteMulti
          v-else
          v-model="filter.value"
          :options-search="(str) => searchOptions(filter.column, str)"
          :model-search="(v) => searchModelMulti(filter.column, v as string[])"
          :disabled="inconsistentSourceSelected"
          position="bottom"
        />
      </template>
      <PlNumberField
        v-if="isNumberType(filter)"
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
