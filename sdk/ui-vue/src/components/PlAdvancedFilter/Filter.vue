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
  searchOptions: (id: string, str: string) => Promise<ListOptionBase<string | number>[]>;
  searchModel: (id: string, str: string) => Promise<ListOptionBase<string | number>>;
}>();

const model = defineModel<Filter>({ required: true });

defineEmits<{
  (e: 'delete', id: string): void;
  (e: 'changeOperand', op: Operand): void;
}>();

async function modelSearchMulti(id: string, v: string[]) {
  return Promise.all(v.map((v) => props.searchModel(id, v)));
}

function changeFilterType(newFilterType?: FilterType) {
  if (!newFilterType) {
    return;
  }
  const nextFilterInfo = getFilterInfo(newFilterType);
  if (currentSpec.value && nextFilterInfo.supportedFor(currentSpec.value) && isNumericValueType(currentInfo.value.spec)) {
    model.value = {
      ...model.value,
      sourceId: model.value.sourceId,
    };
  } else if (
    currentSpec.value && nextFilterInfo.supportedFor(currentSpec.value) && 'substring' in model.value && 'substring' in DEFAULT_FILTERS[newFilterType]
  ) {
    model.value = {
      ...model.value,
      sourceId: model.value.sourceId,
    };
  } else {
    model.value = {
      ...DEFAULT_FILTERS[newFilterType],
      sourceId: model.value.sourceId,
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
      sourceId: model.value.sourceId,
    };
  }
}

const inconsistentSourceSelected = computed(() => !props.sourceIds.includes(model.value.sourceId));
const sourceOptions = computed(() => {
  const options = props.sourceIds.map((v) => ({ value: v, label: props.sourceInfoBySourceId[v]?.label ?? v }));
  if (inconsistentSourceSelected.value) {
    options.unshift({ value: model.value.sourceId, label: 'Inconsistent value' });
  }
  return options;
});

const currentInfo = computed(() => props.sourceInfoBySourceId[model.value.sourceId]);
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
    return [...new Set(model.value.reference.split(''))].sort().map((v) => ({ value: v, label: v }));
  }
  return [];
});

const stringMatchesError = computed(() => {
  if (model.value.type !== 'patternMatchesRegularExpression') {
    return false;
  }
  try {
    new RegExp(model.value.reference);
    return false;
  } catch (_err) {
    return true;
  }
});

const preloadedOptions = computed(() => {
  if (!isStringValueType(props.sourceInfoBySourceId[model.value.sourceId]?.spec)) {
    return null;
  }
  if (model.value.type !== 'patternEquals' && model.value.type !== 'patternNotEquals' && model.value.type !== 'InSet' && model.value.type !== 'NotInSet') {
    return null;
  }
  const uniqueValues = props.uniqueValuesBySourceId[model.value.sourceId] ?? null;
  return inconsistentSourceSelected.value ? null : uniqueValues;
});

</script>
<template>
  <div :class="$style.filter_wrapper">
    <!-- top element - column selector / column label - for all filter types-->
    <div v-if="dndMode" :class="[$style.top, $style.column_chip, {[$style.error]: currentError}]">
      <div :class="[$style.typeIcon, {[$style.error]: currentError}]">
        <PlIcon16 v-if="currentError" name="warning"/>
        <PlIcon16 v-else :name="currentType === 'String' || currentType === undefined? 'cell-type-txt' : 'cell-type-num'"/>
      </div>
      <div :class="$style.title_wrapper" :title="currentInfo?.label ?? ''">
        <div :class="$style.title">
          {{ inconsistentSourceSelected ? 'Inconsistent value' : currentInfo?.label ?? model.sourceId }}
        </div>
      </div>
      <div :class="$style.closeIcon" @click="$emit('delete', model.sourceId)">
        <PlIcon16 name="close"/>
      </div>
    </div>
    <div v-else :class="$style.top" >
      <PlDropdown
        v-model="model.sourceId"
        :error="currentError ? ' ' : undefined"
        :options="sourceOptions"
        :showErrorMessage="false"
        :style="{width: '100%'}"
        @update:model-value="changeSourceId"
      />
      <div :class="$style.closeButton" @click="$emit('delete', model.sourceId)">
        <PlIcon16 name="close"/>
      </div>
    </div>

    <!-- middle - filter type selector -  for all filter types -->
    <div :class="model.type === 'isNA' || model.type === 'isNotNA' ? $style.bottom : $style.middle">
      <PlDropdown
        v-model="model.type"
        :options="filterTypesOptions"
        @update:model-value="changeFilterType"
      />
    </div>

    <!-- middle - for fuzzy contains filter -->
    <template v-if="model.type === 'patternFuzzyContainSubsequence'">
      <div :class="$style.middle">
        <PlTextField
          v-model="model.reference"
          placeholder="Substring"
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
          v-model="model.reference"
          :options="preloadedOptions"
          :disabled="inconsistentSourceSelected"
        />
        <PlAutocomplete
          v-else
          v-model="model.reference"
          :options-search="(str) => searchOptions(model.sourceId, str)"
          :model-search="(v) => searchModel(model.sourceId, v as string)"
          :disabled="inconsistentSourceSelected"
        />
      </template>
      <template v-if="model.type === 'InSet' || model.type === 'NotInSet'" >
        <PlDropdownMulti
          v-if="preloadedOptions !== null"
          v-model="model.reference"
          :options="preloadedOptions"
          :disabled="inconsistentSourceSelected"
        />
        <PlAutocompleteMulti
          v-else
          v-model="model.reference"
          :options-search="(str) => searchOptions(model.sourceId, str)"
          :model-search="(v) => modelSearchMulti(model.sourceId, v as string[])"
          :disabled="inconsistentSourceSelected"
        />
      </template>
      <PlNumberField
        v-if="model.type === 'numberEquals'
          || model.type === 'numberNotEquals'
          || model.type === 'lessThan'
          || model.type === 'lessThanOrEqual'
          || model.type === 'greaterThan'
          || model.type === 'greaterThanOrEqual'
        "
        v-model="model.reference as number"
      />
      <PlTextField
        v-if="model.type === 'patternContainSubsequence' || model.type === 'patternNotContainSubsequence'"
        v-model="model.substring"
        placeholder="Substring"
      />
      <PlTextField
        v-if="model.type === 'patternMatchesRegularExpression'"
        v-model="model.reference"
        :error="stringMatchesError ? 'Regular expression is not valid' : undefined"
        placeholder="Regular expression"
      />
      <PlDropdown
        v-if="model.type === 'patternFuzzyContainSubsequence'"
        v-model="model.wildcard"
        clearable
        placeholder="Wildcard value"
        :options="wildcardOptions"
      />
    </div>
  </div>
  <div :class="$style.button_wrapper">
    <OperandButton
      :active="operand"
      :disabled="last"
      @select="(v) => $emit('changeOperand', v)"
    />
  </div>
</template>

<style lang="scss" module>
.filter_wrapper {
  --errorColor: #FF5C5C;

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
   --icon-color: var(--errorColor);
  }
}

.closeIcon {
  display: inline-flex;
  margin-left: 12px;
  cursor: pointer;
}

.title_wrapper {
  flex-grow: 1;
  overflow: hidden;
}
.title {
  overflow: hidden;
  color: var(--txt-01);
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: Manrope;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
}

.column_chip {
  width: 100%;
  display: flex;
  padding: 10px 12px;
  align-items: center;
  border-radius: 6px;
  border: 1px solid var(--txt-01);
  border-bottom-right-radius: 0;
  border-bottom-left-radius: 0;

  &.error {
    border-color: var(--errorColor);
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
  :global(.double-contour) > div {
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
      border-bottom-left-radius: 0;
  }
}

.middle {
  position: relative;
  margin-top: -1px;
  :global(.double-contour) > div {
      border-radius: 0;
  }
}

.bottom {
  position: relative;
  margin-top: -1px;
  :global(.double-contour) > div {
      border-top-right-radius: 0;
      border-top-left-radius: 0;
  }
}

.button_wrapper {
  margin-bottom: 8px;
}
</style>
