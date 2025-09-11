<script setup lang="ts">
import { PlPureSlideModal } from '@milaboratories/uikit';
import type { PObjectId, SimplifiedUniversalPColumnEntry } from '@platforma-sdk/model';
import { effect, shallowRef } from 'vue';
import type { AnnotationSpecUi } from '../types';
import PlAnnotations from './PlAnnotations.vue';

// Models
const annotation = defineModel<AnnotationSpecUi>('annotation', { required: true });
const opened = defineModel<boolean>('opened', { required: true });
// Props
const props = defineProps<{
  columns: SimplifiedUniversalPColumnEntry[];
  hasSelectedColumns: boolean;
  getValuesForSelectedColumns: () => Promise<undefined | { columnId: PObjectId; values: string[] }>;

  onDeleteSchema?: () => void;
}>();
// State
const selectedStepId = shallowRef<number | undefined>(undefined);
// Watchers
effect(function setDefaultStepId() {
  if (selectedStepId.value === undefined && annotation.value.steps.length > 0) {
    selectedStepId.value = annotation.value.steps[0].id;
  }
});
// Actions
async function handleDeleteSchema() {
  opened.value = false;
  props.onDeleteSchema?.();
}
</script>

<template>
  <PlPureSlideModal v-model="opened" :class="$style.modal" width="768px">
    <PlAnnotations
      v-model:annotation="annotation"
      :class="$style.sidebarItem"
      :columns="props.columns"
      :has-selected-columns="props.hasSelectedColumns"
      :getValuesForSelectedColumns="props.getValuesForSelectedColumns"
      @delete-schema="handleDeleteSchema"
    />
  </PlPureSlideModal>
</template>

<style lang="scss" module>
.modal {
  display: flex;
}

.sidebarGroup {
  width: 100%;
  height: 100%;
}

.sidebarItem {
  width: 100%;
  height: 100%;
}
</style>
