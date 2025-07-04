<script setup lang="ts">
import { shallowRef } from 'vue';
import { PlSidebarGroup, PlPureSlideModal } from '@milaboratories/uikit';
import type { AnnotationScriptUi } from '@platforma-sdk/model';
import type { SimplifiedUniversalPColumnEntry } from './types';
import { getDefaultAnnotationScript } from './utils';
import AnnotationsSidebar from './AnnotationsSidebar.vue';
import FilterSidebar from './FilterSidebar.vue';

// Models
const annotation = defineModel<AnnotationScriptUi>('annotation', { required: true, default: getDefaultAnnotationScript });
const opened = defineModel<boolean>('opened', { required: true });
// Props
const props = defineProps<{ columns: SimplifiedUniversalPColumnEntry[] }>();
// State
const selectedStepId = shallowRef<number | undefined>(undefined);
</script>

<template>
  <PlPureSlideModal ref="modal" v-model="opened" :class="$style.modal" width="768px">
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
