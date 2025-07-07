<script setup lang="ts">
import { isNil, randomInt } from '@milaboratories/helpers';
import {
  PlBtnSecondary,
  PlEditableTitle,
  PlElementList,
  PlSidebarItem,
} from '@milaboratories/uikit';
import type { AnnotationStepUi, FilterUi } from '@platforma-sdk/model';
import { getFilterUiMetadata } from '@platforma-sdk/model';
import type { SimplifiedUniversalPColumnEntry } from '../types';
import { createDefaultFilterMetadata } from '../utils';
import DynamicForm from './DynamicForm.vue';

// Models
const step = defineModel<AnnotationStepUi>('step');
// Props
const props = defineProps<{
  columns: SimplifiedUniversalPColumnEntry[];
}>();
// Actions
const addFilter = () => {
  if (isNil(step.value)) return;

  step.value?.filter.filters.push({
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
  <PlSidebarItem v-if="step">
    <template #header-content>
      <PlEditableTitle
        :key="step.id"
        v-model="step.label"
        :max-length="40"
        max-width="600px"
        placeholder="Annotation Name"
        :autofocus="step.label.length === 0"
      />
    </template>
    <template #body-content>
      <div :class="$style.root">
        <PlBtnSecondary style="width: 100%;" icon="add" @click="addFilter">
          Add filter
        </PlBtnSecondary>

        <span :class="$style.tip">Lower annotations override the ones above. Rearrange them by dragging.</span>

        <PlElementList
          v-model:items="step.filter.filters"
          :get-item-key="(item) => item.id!"
          :is-expanded="(item) => Boolean(item.isExpanded)"
          :on-expand="(item) => item.isExpanded = !Boolean(item.isExpanded)"
        >
          <template #item-title="{ item }">
            {{ getColumnLabel(item) }}
          </template>
          <template #item-content="{ item, index }">
            <DynamicForm
              v-model="step.filter.filters[index]"
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
