<script setup lang="ts">
import { PlPureSlideModal, PlSidebarGroup } from '@milaboratories/uikit';
import type { AnnotationScriptUi } from '@platforma-sdk/model';
import { computed, effect, shallowRef } from 'vue';
import type { SimplifiedUniversalPColumnEntry } from '../types';
import { getDefaultAnnotationScript } from '../utils';
import AnnotationsSidebar from './AnnotationsSidebar.vue';
import FilterSidebar from './FilterSidebar.vue';
import PlAnnotationCreateDialog from './PlAnnotationCreateDialog.vue';

// Models
const annotation = defineModel<AnnotationScriptUi>('annotation', { required: true, default: getDefaultAnnotationScript });
const opened = defineModel<boolean>('opened', { required: true });
// Props
const props = defineProps<{ columns: SimplifiedUniversalPColumnEntry[] }>();
// State
const selectedStepId = shallowRef<number | undefined>(undefined);
const hasAnnotation = computed(() => annotation.value.isCreated === true);

const openedDialog = computed({
  get: () => !hasAnnotation.value && opened.value,
  set: (value: boolean) => (opened.value = value),
});
const openedModal = computed({
  get: () => hasAnnotation.value && opened.value,
  set: (value: boolean) => (opened.value = value),
});

effect(() => {
  if (selectedStepId.value === undefined && annotation.value.steps.length > 0) {
    selectedStepId.value = annotation.value.steps[0].id;
  }
});

function handleCreateAnnotation(props: { type: 'byClonotype' | 'bySampleAndClonotype'; name: string }) {
  annotation.value.isCreated = true;
  annotation.value.mode = props.type;
  annotation.value.title = props.name;
  annotation.value.steps = [];
}
</script>

<template>
  <PlAnnotationCreateDialog v-model="openedDialog" @submit="handleCreateAnnotation"/>
  <PlPureSlideModal v-model="openedModal" :class="$style.modal" width="768px">
    <PlSidebarGroup :class="$style.sidebarGroup">
      <template #item-0>
        <AnnotationsSidebar
          v-model:annotation="annotation"
          v-model:selectedStepId="selectedStepId"
          :class="$style.sidebarItem"
          :columns="props.columns"
        />
      </template>
      <template #item-1>
        <FilterSidebar
          v-model:annotation="annotation"
          :class="$style.sidebarItem"
          :columns="props.columns"
          :selectedStepId="selectedStepId"
        />
      </template>
    </PlSidebarGroup>
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
