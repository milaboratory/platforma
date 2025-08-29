<script setup lang="ts">
import { isNil, randomInt } from '@milaboratories/helpers';
import {
  PlBtnSecondary,
  PlEditableTitle,
  PlElementList,
  PlSidebarItem,
} from '@milaboratories/uikit';
import type { AnnotationStepUi, FiltersUi, PObjectId, SUniversalPColumnId } from '@platforma-sdk/model';
import { getFilterUiMetadata } from '@platforma-sdk/model';
import type { SimplifiedUniversalPColumnEntry } from '../types';
import { createDefaultFilterMetadata } from '../utils';
import DynamicForm from './DynamicForm.vue';

// Models
const step = defineModel<AnnotationStepUi>('step', { required: true });
// Props
const props = defineProps<{
  columns: SimplifiedUniversalPColumnEntry[];
  hasSelectedColumns: boolean;
  getValuesForSelectedColumns: () => Promise<undefined | { columnId: PObjectId; values: string[] }>;
}>();
// Actions
const addFilterPlaceholder = () => {
  step.value.filter.filters.push({
    id: randomInt(),
    isExpanded: true,
    type: undefined,
  });
};

async function addFilterFromSelected() {
  const data = await props.getValuesForSelectedColumns();
  if (!data || data.values.length === 0) return;

  const { columnId, values } = data;
  const shortReminder = values.slice(0, 3).join(', ') + (values.length > 3 ? ` and ${values.length - 3} more` : '');

  step.value.filter.filters.push({
    id: randomInt(),
    name: `Selected list (${shortReminder})`,
    isExpanded: false,
    type: 'or',
    filters: values.map((value) => ({
      type: 'patternEquals',
      column: columnId as SUniversalPColumnId,
      value,
    })),
  });
}

// Getters
const getColumnLabel = (filter: FiltersUi) => {
  if (!isNil(filter.name)) return filter.name;
  return props.columns
    .find((c) => 'column' in filter ? c.id === filter.column : false)?.label
    ?? filter.type;
};

const getFormMetadata = (filter: FiltersUi) => {
  return !isNil(filter.type) ? getFilterUiMetadata(filter.type).form : createDefaultFilterMetadata();
};

const getFilterValues = (filter: FiltersUi) => {
  if (filter.type === 'or' || filter.type === 'and') {
    return filter.filters.map((f) => 'value' in f && !isNil(f.value) ? f.value : null).filter((v) => !isNil(v)).join (', ');
  }
  return null;
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
        <div :class="$style.actions">
          <PlBtnSecondary style="width: 100%;" icon="add" @click="addFilterPlaceholder">
            Filter
          </PlBtnSecondary>
          <PlBtnSecondary style="width: 100%;" icon="add" :disabled="!props.hasSelectedColumns" @click="addFilterFromSelected">
            From selection
          </PlBtnSecondary>
        </div>

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
            <template v-if="item.type !== 'or' && item.type !== 'and'">
              <DynamicForm
                v-model="step.filter.filters[index]"
                :form-metadata="getFormMetadata(item)"
                :columns="props.columns"
              />
            </template>
            <template v-else>
              <div>{{ getFilterValues(item) }}</div>
            </template>
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

.actions {
  display: flex;
  flex-direction: row;
  gap: 12px;
}
</style>
