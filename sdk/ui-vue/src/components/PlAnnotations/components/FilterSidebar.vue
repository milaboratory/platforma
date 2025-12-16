<script lang="ts">
export type Props = {
  columns: PlAdvancedFilterItem[];

  getSuggestOptions: (params: { columnId: PlAdvancedFilterColumnId; axisIdx?: number; searchStr: string; searchType: 'value' | 'label' }) =>
    ListOptionBase<string | number>[] | Promise<ListOptionBase<string | number>[]>;

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
import type { ListOptionBase, PObjectId, SUniversalPColumnId } from '@platforma-sdk/model';
import { computed } from 'vue';
import type { PlAdvancedFilterFilter, PlAdvancedFilterSupportedFilters } from '../../PlAdvancedFilter';
import { PlAdvancedFilter, type PlAdvancedFilterItem } from '../../PlAdvancedFilter';
import type { PlAdvancedFilterColumnId } from '../../PlAdvancedFilter/types';
import type { Filter } from '../types';

import $commonStyle from './style.module.css';

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
    type: 'or',
    filters: [
      {
        id: randomInt(),
        type: 'isNA',
        column: props.columns[0].id as SUniversalPColumnId,
      },
    ],
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

const supportedFilters = [
  'isNA',
  'isNotNA',
  'greaterThan',
  'greaterThanOrEqual',
  'lessThan',
  'lessThanOrEqual',
  'patternEquals',
  'patternNotEquals',
  'patternContainSubsequence',
  'patternNotContainSubsequence',
  'equal',
  'notEqual',
  'topN',
  'bottomN',
] as typeof PlAdvancedFilterSupportedFilters[number][];
</script>

<template>
  <PlSidebarItem v-if="step">
    <template #header-content>
      <PlEditableTitle
        :key="step.id"
        v-model="step.label"
        :class="{ [$commonStyle.flashing]: step.label.length === 0 }"
        :max-length="40"
        max-width="600px"
        placeholder="Label name"
        :autofocus="step.label.length === 0"
      />
    </template>
    <template #body-content>
      <PlAdvancedFilter
        v-model:filters="(step.filter as PlAdvancedFilterFilter)"
        :class="[$style.root, { [$commonStyle.disabled]: step.label.length === 0 }]"
        :items="props.columns"
        :supported-filters="supportedFilters"
        :get-suggest-options="props.getSuggestOptions"
        :enable-dnd="false"
        :enable-add-group-button="true"
      >
        <template #add-group-buttons>
          <div :class="$style.actions">
            <PlBtnSecondary icon="add" @click="addFilterPlaceholder">
              Add Filter
            </PlBtnSecondary>
            <PlBtnSecondary v-if="withSelection" icon="add" :disabled="!props.hasSelectedColumns" @click="addFilterFromSelected">
              From selection
            </PlBtnSecondary>
          </div>
        </template>
      </PlAdvancedFilter>
    </template>
  </PlSidebarItem>
</template>

<style module>
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
