<script lang="ts" setup>
import type { Filter, FilterType, Operand, SourceOptionsInfo, UniqueValuesInfo } from './types';
import { PlIcon16, PlDropdown, PlDropdownMulti, PlAutocomplete, PlAutocompleteMulti, PlTextField, PlNumberField, Slider, PlToggleSwitch } from '@milaboratories/uikit';
import { computed } from 'vue';
import { ALL_FILTER_TYPES, DEFAULT_FILTER_TYPE, DEFAULT_FILTERS } from './constants';
import { Annotation, Domain, readAnnotation, readDomain, type ListOptionBase } from '@platforma-sdk/model';
import OperandButton from './OperandButton.vue';
import { getFilterInfo, getNormalizedSpec, isNumericValueType, isStringValueType } from './utils';

const props = defineProps<{
  operand: Operand;
  sourceIds: string[];
  dndMode: boolean;
  last: boolean;
  sourceInfoBySourceId: SourceOptionsInfo;
  uniqueValuesBySourceId: UniqueValuesInfo;
  searchOptionsFn?: (id: string, str: string) => (Promise<ListOptionBase<string | number>[]>) | ((id: string, str: string) => ListOptionBase<string | number>[]);
  searchModelFn?: (id: string, str: string) => (Promise<ListOptionBase<string | number>>) | ((id: string, str: string) => ListOptionBase<string | number>);
  onDelete: (id: string) => void;
  onChangeOperand: (op: Operand) => void;
}>();

const model = defineModel<Filter>({ required: true });

async function modelSearchMulti(id: string, v: string[]): Promise<ListOptionBase<string>[]> {
  const searchFn = props.searchModelFn;
  return Promise.all(v.map((v) => searchFn ? searchFn(id, v) as Promise<ListOptionBase<string>> : Promise.resolve({ label: '', value: '' })));
}
async function modelSearch(id: string, v: string): Promise<ListOptionBase<string>> {
  const searchFn = props.searchModelFn;
  return searchFn ? searchFn(id, v) as Promise<ListOptionBase<string>> : Promise.resolve({ label: '', value: '' });
}
async function optionsSearch(id: string, str: string): Promise<ListOptionBase<string>[]> {
  const searchFn = props.searchOptionsFn;
  return searchFn ? searchFn(id, str) as Promise<ListOptionBase<string>[]> : Promise.resolve([]);
}

function changeFilterType(newFilterType?: FilterType) {
  if (!newFilterType) {
    return;
  }
  const nextFilterInfo = getFilterInfo(newFilterType);
  if (currentSpec.value && nextFilterInfo.supportedFor(currentSpec.value) && isNumericValueType(currentInfo.value.spec)) {
    model.value = {
      ...model.value,
      column: model.value.column,
    };
  } else if (
    currentSpec.value && nextFilterInfo.supportedFor(currentSpec.value) && 'substring' in model.value && 'substring' in DEFAULT_FILTERS[newFilterType]
  ) {
    model.value = {
      ...model.value,
      column: model.value.column,
    };
  } else {
    model.value = {
      ...DEFAULT_FILTERS[newFilterType],
      column: model.value.column,
    };
  }
}

function changeSourceId(newSourceId?: string) {
  if (!newSourceId) {
    return;
  }
  const filterInfo = getFilterInfo(model.value.type);
  const newSourceSpec = getNormalizedSpec(props.sourceInfoBySourceId[newSourceId]?.spec);
  if (filterInfo.supportedFor(newSourceSpec)) { // don't do anything except update source id
    return;
  } else { // new source id doesn't fit current filter by type (string/number), reset to default filter
    model.value = {
      ...DEFAULT_FILTERS[DEFAULT_FILTER_TYPE],
      column: model.value.column,
    };
  }
}

const inconsistentSourceSelected = computed(() => !props.sourceIds.includes(model.value.column));
const sourceOptions = computed(() => {
  const options = props.sourceIds.map((v) => ({ value: v, label: props.sourceInfoBySourceId[v]?.label ?? v }));
  if (inconsistentSourceSelected.value) {
    options.unshift({ value: model.value.column, label: 'Inconsistent value' });
  }
  return options;
});

const currentInfo = computed(() => props.sourceInfoBySourceId[model.value.column]);
const currentSpec = computed(() => currentInfo.value?.spec ? getNormalizedSpec(currentInfo.value.spec) : null);
const currentType = computed(() => currentSpec.value?.valueType);
const currentError = computed(() => currentInfo.value?.error || inconsistentSourceSelected.value);

const filterTypesOptions = computed(() => [...ALL_FILTER_TYPES].filter((v) =>
  model.value.type === v || (currentSpec.value ? getFilterInfo(v).supportedFor(currentSpec.value) : true),
).map((v) => ({ value: v, label: getFilterInfo(v).label })),
);

const wildcardOptions = computed(() => {
  if (model.value.type === 'patternFuzzyContainSubsequence') {
    const alphabet = currentSpec.value ? readDomain(currentSpec.value, Domain.Alphabet) ?? readAnnotation(currentSpec.value, Annotation.Alphabet) : null;
    if (alphabet === 'nucleotide') {
      return [{ label: 'N', value: 'N' }];
    }
    if (alphabet === 'aminoacid') {
      return [{ label: 'X', value: 'X' }];
    }
    return [...new Set(model.value.value.split(''))].sort().map((v) => ({ value: v, label: v }));
  }
  return [];
});

const stringMatchesError = computed(() => {
  if (model.value.type !== 'patternMatchesRegularExpression') {
    return false;
  }
  try {
    new RegExp(model.value.value);
    return false;
  } catch {
    return true;
  }
});

const preloadedOptions = computed(() => {
  if (!isStringValueType(props.sourceInfoBySourceId[model.value.column]?.spec) || inconsistentSourceSelected.value) {
    return null;
  }
  if (model.value.type !== 'patternEquals' && model.value.type !== 'patternNotEquals' && model.value.type !== 'inSet' && model.value.type !== 'notInSet') {
    return null;
  }
  const uniqueValues = props.uniqueValuesBySourceId[model.value.column];
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
      <div :class="$style.titleWrapper" :title="currentInfo?.label ?? ''">
        <div :class="$style.title">
          {{ inconsistentSourceSelected ? 'Inconsistent value' : currentInfo?.label ?? model.column }}
        </div>
      </div>
      <div :class="$style.closeIcon" @click="onDelete(model.column)">
        <PlIcon16 name="close"/>
      </div>
    </div>
    <div v-else :class="$style.top" >
      <PlDropdown
        v-model="model.column"
        :errorStatus="currentError"
        :options="sourceOptions"
        :style="{width: '100%'}"
        position="top-left"
        @update:model-value="changeSourceId"
      />
      <div :class="$style.closeButton" @click="onDelete(model.column)">
        <PlIcon16 name="close"/>
      </div>
    </div>

    <!-- middle - filter type selector -  for all filter types -->
    <div :class="model.type === 'isNA' || model.type === 'isNotNA' ? $style.bottom : $style.middle">
      <PlDropdown
        v-model="model.type"
        :options="filterTypesOptions"
        :position="model.type === 'isNA' || model.type === 'isNotNA' ? 'bottom' : 'middle'"
        @update:model-value="changeFilterType"
      />
    </div>

    <!-- middle - for fuzzy contains filter -->
    <template v-if="model.type === 'patternFuzzyContainSubsequence'">
      <div :class="$style.middle">
        <PlTextField
          v-model="model.value"
          placeholder="Substring"
          position="middle"
        />
      </div>
      <div :class="$style.innerSection">
        <Slider
          v-model="model.maxEdits"
          :max="5"
          breakpoints label="Maximum number of substitutions and indels"
        />
        <PlToggleSwitch
          v-model="model.substitutionsOnly"
          label="Substitutions only"
        />
      </div>
    </template>

    <!-- bottom element - individual settings for every filter type -->
    <div :class="$style.bottom">
      <template v-if="model.type === 'patternEquals' || model.type === 'patternNotEquals'" >
        <PlDropdown
          v-if="preloadedOptions !== null"
          v-model="model.value"
          :options="preloadedOptions"
          :disabled="inconsistentSourceSelected"
          position="bottom"
        />
        <PlAutocomplete
          v-else
          v-model="model.value"
          :options-search="(str) => optionsSearch(model.column, str)"
          :model-search="(v) => modelSearch(model.column, v as string)"
          :disabled="inconsistentSourceSelected"
          position="bottom"
        />
      </template>
      <template v-if="model.type === 'inSet' || model.type === 'notInSet'" >
        <PlDropdownMulti
          v-if="preloadedOptions !== null"
          v-model="model.value"
          :options="preloadedOptions"
          :disabled="inconsistentSourceSelected"
          position="bottom"
        />
        <PlAutocompleteMulti
          v-else
          v-model="model.value"
          :options-search="(str) => optionsSearch(model.column, str)"
          :model-search="(v) => modelSearchMulti(model.column, v as string[])"
          :disabled="inconsistentSourceSelected"
          position="bottom"
        />
      </template>
      <PlNumberField
        v-if="isNumberType(model)"
        v-model="model.x"
        position="bottom"
      />
      <PlTextField
        v-if="model.type === 'patternContainSubsequence' || model.type === 'patternNotContainSubsequence'"
        v-model="model.value"
        placeholder="Substring"
        position="bottom"
      />
      <PlTextField
        v-if="model.type === 'patternMatchesRegularExpression'"
        v-model="model.value"
        :error="stringMatchesError ? 'Regular expression is not valid' : undefined"
        placeholder="Regular expression"
        position="bottom"
      />
      <PlDropdown
        v-if="model.type === 'patternFuzzyContainSubsequence'"
        v-model="model.wildcard"
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
  background: #FFF;
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
}

.middle, .bottom {
  position: relative;
  margin-top: -1px;
}

.buttonWrapper {
  margin-bottom: 8px;
}
</style>
