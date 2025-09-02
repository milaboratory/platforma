<script lang="ts" setup>
import type { ListOption } from '@milaboratories/uikit';
import type { Filter, FilterType, Operand, SourceOptionsInfo } from './types';
import { PlIcon16, PlDropdown, PlDropdownMulti, PlAutocomplete, PlAutocompleteMulti, PlTextField, PlNumberField, Slider, PlToggleSwitch } from '@milaboratories/uikit';
import { computed, watch } from 'vue';
import { DEFAULT_FILTER_TYPE, DEFAULT_FILTERS, FILTER_TYPE_OPTIONS } from './constants';
import { type ListOptionBase } from '@platforma-sdk/model';
import OperandButton from './OperandButton.vue';

const props = defineProps<{
  operand: Operand;
  info: SourceOptionsInfo;
  sourceIds: string[];
  dndMode: boolean;
  preloadedOptions: ListOption<string | number>[] | null;
  searchOptions: (id: string, str: string) => Promise<ListOptionBase<string | number>[]>;
  searchModel: (id: string, str: string) => Promise<ListOptionBase<string | number>>;
}>();

const model = defineModel<Filter>({ required: true });

watch(() => model.value, (m) => {
  console.log('model', m);
});

defineEmits<{
  (e: 'delete', id: string): void;
  (e: 'changeOperand', op: Operand): void;
}>();

const filterTypes = computed(() => FILTER_TYPE_OPTIONS.map((v) => ({ value: v.value, label: v.label })));

async function modelSearchMulti(id: string, v: string[]) {
  return Promise.all(v.map((v) => props.searchModel(id, v)));
}

function changeFilterType(newFilterType?: FilterType) {
  if (!newFilterType) {
    return;
  }
  model.value = {
    ...DEFAULT_FILTERS[newFilterType],
    sourceId: model.value.sourceId,
  };
}

function changeSourceId(newSourceId?: string) {
  if (!newSourceId) {
    return;
  }
  if (props.info[newSourceId].type === props.info[model.value.sourceId].type
    || FILTER_TYPE_OPTIONS.find((op) => op.value === model.value.type)?.valueType === 'any') {
    model.value = {
      ...model.value,
      sourceId: model.value.sourceId,
    };
  } else {
    model.value = {
      ...DEFAULT_FILTERS[DEFAULT_FILTER_TYPE],
      sourceId: model.value.sourceId,
    };
  }
}

const inconsistentSourceSelected = computed(() => !props.sourceIds.includes(model.value.sourceId));
const sourceOptions = computed(() => {
  const options = props.sourceIds.map((v) => ({ value: v, label: props.info[v]?.label ?? v }));
  if (inconsistentSourceSelected.value) {
    options.unshift({ value: model.value.sourceId, label: 'Inconsistent value' });
  }
  return options;
});

const currentInfo = computed(() => props.info[model.value.sourceId]);
const currentType = computed(() => currentInfo.value?.type ?? 'String');
const currentError = computed(() => currentInfo.value?.error || inconsistentSourceSelected.value);

const wildcardOptions = computed(() => {
  if (model.value.type === 'StringContainsFuzzy') {
    return [...new Set(model.value.reference.split(''))].map((v) => ({ value: v, label: v }));
  }
  return [];
});

const stringMatchesError = computed(() => {
  if (model.value.type !== 'StringMatches') {
    return false;
  }
  try {
    new RegExp(model.value.reference);
    return false;
  } catch (_err) {
    return true;
  }
});

</script>
<template>
  <div :class="$style.filter_wrapper">
    <!-- top element - column selector / column label -->
    <div v-if="dndMode" :class="[$style.top, $style.column_chip]">
      <div :class="[$style.typeIcon, {[$style.error]: currentError}]">
        <PlIcon16 v-if="currentError" name="warning"/>
        <PlIcon16 v-else :name="currentType === 'String' ? 'cell-type-txt' : 'cell-type-num'"/>
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

    <!-- middle - filter type selector -->
    <div :class="model.type === 'IsNA' || model.type === 'IsNotNA' ? $style.bottom : $style.middle">
      <PlDropdown
        v-model="model.type"
        :options="filterTypes"
        @update:model-value="changeFilterType"
      />
    </div>

    <!-- middle - for fuzzy contains filter -->
    <template v-if="model.type === 'StringContainsFuzzy'">
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

    <!-- bottom element -->
    <div :class="$style.bottom">
      <template v-if="(model.type === 'Equal' || model.type === 'NotEqual') && currentType === 'String'" >
        <PlDropdown v-if="preloadedOptions !== null" v-model="model.reference" :options="preloadedOptions" />
        <PlAutocomplete
          v-else
          v-model="model.reference"
          :options-search="(str) => searchOptions(model.sourceId, str)"
          :model-search="(v) => searchModel(model.sourceId, v as string)"
        />
      </template>
      <template v-if="(model.type === 'InSet' || model.type === 'NotInSet') && currentType === 'String'" >
        <PlDropdownMulti v-if="preloadedOptions !== null" v-model="model.reference" :options="preloadedOptions" />
        <PlAutocompleteMulti
          v-else
          v-model="model.reference"
          :options-search="(str) => searchOptions(model.sourceId, str)"
          :model-search="(v) => modelSearchMulti(model.sourceId, v as string[])"
        />
      </template>
      <PlNumberField
        v-if="
          (model.type === 'Equal' || model.type === 'NotEqual') && currentType !== 'String' ||
            (model.type === 'Less' || model.type === 'Greater' || model.type === 'GreaterOrEqual' || model.type === 'LessOrEqual')
        "
        v-model="model.reference as number"
      />
      <PlTextField
        v-if="model.type === 'StringContains' || model.type === 'StringNotContains'"
        v-model="model.substring"
        placeholder="Substring"
      />
      <PlTextField
        v-if="model.type === 'StringMatches'"
        v-model="model.reference"
        :error="stringMatchesError ? 'Regular expression is not valid' : undefined"
        placeholder="Regular expression"
      />
      <PlDropdown
        v-if="model.type === 'StringContainsFuzzy'"
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
      :disabled="false"
      @select="(v) => $emit('changeOperand', v)"
    />
  </div>
</template>

<style lang="scss" module>
.filter_wrapper {
  $errorColor: #FF5C5C;

  position: relative;
  display: flex;
  flex-direction: column;
  margin-bottom: 8px;
  width: 100%;
  background: #FFF;
  cursor: default;

  &.error {
    * {
      border-color: var(--errorColor);
    }
  }
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
