<script lang="ts">
export type Props = {
  columns: PlAdvancedFilterItem[];
  hasSelectedColumns?: boolean;
  getValuesForSelectedColumns?: () => Promise<undefined | { columnId: PObjectId; values: string[] }>;
};
</script>
<script setup lang="ts">
import { randomInt } from '@milaboratories/helpers';
import {
  PlBtnSecondary,
  PlEditableTitle,
  PlSidebarItem,
} from '@milaboratories/uikit';
import type { PObjectId, SUniversalPColumnId } from '@platforma-sdk/model';
import { computed } from 'vue';
import type { PlAdvancedFilterFilter } from '../../PlAdvancedFilter';
import { PlAdvancedFilter, type PlAdvancedFilterItem } from '../../PlAdvancedFilter';
import type { Filter } from '../types';

// Models
const step = defineModel<Filter>('step', { required: true });
// Props
const props = defineProps<Props>();
// State
const withSelection = computed(() => {
  return props.hasSelectedColumns !== undefined && props.getValuesForSelectedColumns !== undefined;
});
// Actions
const addFilterPlaceholder = () => {
  step.value.filter.filters.push({
    id: randomInt(),
    isExpanded: true,
    type: undefined,
  });
};

async function addFilterFromSelected() {
  if (props.hasSelectedColumns === undefined || props.getValuesForSelectedColumns === undefined) return;

  const data = await props.getValuesForSelectedColumns();
  if (!data || data.values.length === 0) return;

  const { columnId, values } = data;
  const shortReminder = values.slice(0, 3).join(', ') + (values.length > 3 ? ` and ${values.length - 3} more` : '');

  step.value.filter.filters.push({
    id: randomInt(),
    name: `Selected list (${shortReminder})`,
    isExpanded: false,
    type: 'or',
    filters: values.map((value, i) => ({
      id: i,
      type: 'patternEquals',
      column: columnId as SUniversalPColumnId,
      value,
    })),
  });
}
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
          <PlBtnSecondary v-if="withSelection" style="width: 100%;" icon="add" :disabled="!props.hasSelectedColumns" @click="addFilterFromSelected">
            From selection
          </PlBtnSecondary>
        </div>

        <PlAdvancedFilter
          v-model:filters="step.filter as PlAdvancedFilterFilter"
          :items="props.columns"
          :get-suggest-model="() => ({
            label: 'string',
            value: 'T',
          })"
          :get-suggest-options="() => ([{
            label: 'string',
            value: 'T',
          }])"
          :enable-dnd="false"
        />

        <!--        <PlElementList-->
        <!--          v-model:items="step.filter.filters"-->
        <!--          :get-item-key="(item) => item.id"-->
        <!--          :is-expanded="(item) => Boolean(item.isExpanded)"-->
        <!--          :on-expand="(item) => item.isExpanded = !Boolean(item.isExpanded)"-->
        <!--        >-->
        <!--          <template #item-title="{ item }">-->
        <!--            {{ getColumnLabel(item) }}-->
        <!--          </template>-->
        <!--          <template #item-content="{ item, index }">-->
        <!--            <template v-if="item.type !== 'or' && item.type !== 'and'">-->
        <!--              <DynamicForm-->
        <!--                v-model="(step.filter.filters[index] as FilterSpecLeaf)"-->
        <!--                :columns="props.columns"-->
        <!--                :form-metadata="getFormMetadata(item)"-->
        <!--              />-->
        <!--            </template>-->
        <!--            <template v-else>-->
        <!--              <div>{{ getFilterValues(item) }}</div>-->
        <!--            </template>-->
        <!--          </template>-->
        <!--        </PlElementList>-->
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
