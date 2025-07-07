<script setup lang="ts">
import type { AnnotationScriptUi, FilterUi } from '@platforma-sdk/model';
import { getFilterUiMetadata } from '@platforma-sdk/model';
import { isNil, randomInt } from '@milaboratories/helpers';
import { computed } from 'vue';
import {
  PlBtnSecondary,
  PlEditableTitle,
  PlSidebarItem,
  PlElementList,
} from '@milaboratories/uikit';
import type { SimplifiedUniversalPColumnEntry } from '../types';
import { createDefaultFilterMetadata } from '../utils';
import DynamicForm from './DynamicForm.vue';

// Models
const annotation = defineModel<AnnotationScriptUi>('annotation', { required: true });
// Props
const props = defineProps<{
  columns: SimplifiedUniversalPColumnEntry[];
  selectedStepId: undefined | number;
}>();
// State
const selectedStep = computed(() => {
  return isNil(props.selectedStepId) || isNil(annotation.value)
    ? undefined
    : annotation.value.steps.find((step) => step.id === props.selectedStepId);
});

const addFilter = () => {
  if (isNil(selectedStep.value)) return;

  selectedStep.value?.filter.filters.push({
    id: randomInt(),
    isExpanded: true,
    type: undefined,
  });
};

const getColumnLabel = (filter: FilterUi) => {
  return props.columns
    .find((c) => 'column' in filter ? c.id === filter.column : false)?.label
    ?? filter.type;
};

const getFormMetadata = (filter: FilterUi) => {
  return !isNil(filter.type) ? getFilterUiMetadata(filter.type).form : createDefaultFilterMetadata();
};
</script>

<template>
  <PlSidebarItem v-if="selectedStep">
    <template #header-content>
      <PlEditableTitle
        :key="selectedStep.id"
        v-model="selectedStep.label"
        :max-length="40"
        max-width="600px"
        placeholder="Annotation Name"
        :autofocus="selectedStep.label.length === 0"
      />
    </template>
    <template #body-content>
      <div :class="$style.root">
        <PlBtnSecondary style="width: 100%;" icon="add" @click="addFilter">
          Add filter
        </PlBtnSecondary>

        <span :class="$style.tip">Lower annotations override the ones above. Rearrange them by dragging.</span>

        <PlElementList
          v-model:items="selectedStep.filter.filters"
          :get-item-key="(item) => item.id!"
          :is-expanded="(item) => Boolean(item.isExpanded)"
          :on-expand="(item) => item.isExpanded = !Boolean(item.isExpanded)"
        >
          <template #item-title="{ item }">
            {{ getColumnLabel(item) }}
          </template>
          <template #item-content="{ item, index }">
            <DynamicForm
              v-model="selectedStep.filter.filters[index]"
              :form-metadata="getFormMetadata(item)"
              :columns="props.columns"
            />
          </template>
        </PlElementList>
      </div>
    </template>
  </PlSidebarItem>
</template>

<style lang="scss" module>
@use '@milaboratories/uikit/styles/variables' as *;

.root {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tip {
  margin-top: 12px;
  color: var(--txt-03);
}
</style>
