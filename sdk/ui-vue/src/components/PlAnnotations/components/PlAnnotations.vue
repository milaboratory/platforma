<script lang="ts">
import type { Props as BaseProps } from "./FilterSidebar.vue";
export type Props = BaseProps & {
  onDeleteSchema?: () => void;
};
</script>

<script setup lang="ts">
import { computed, effect, shallowRef } from "vue";

import { isNil } from "@milaboratories/helpers";
import { PlSidebarGroup, useConfirm } from "@milaboratories/uikit";

import type { Annotation } from "../types";
import AnnotationsSidebar from "./AnnotationsSidebar.vue";
import FilterSidebar from "./FilterSidebar.vue";

// Models
const annotation = defineModel<Annotation>("annotation", { required: true });
// Props
const props = defineProps<Props>();
// State
const selectedStepId = shallowRef<number | undefined>(undefined);
const selectedStep = computed(() => {
  return isNil(selectedStepId.value) || isNil(annotation.value)
    ? undefined
    : annotation.value.steps.find((step) => step.id === selectedStepId.value);
});

// Watchers
effect(function setDefaultStepId() {
  if (selectedStepId.value === undefined && annotation.value.steps.length > 0) {
    selectedStepId.value = annotation.value.steps[0].id;
  }
});
// Hooks
const confirmResetSchema = useConfirm({
  title: "Reset Schema",
  message: "Are you sure you want to reset the schema? This action cannot be undone.",
  confirmLabel: "Yes, reset",
  cancelLabel: "No, cancel",
});
// Actions
async function handleDeleteSchema() {
  if (await confirmResetSchema()) {
    selectedStepId.value = undefined;
    props.onDeleteSchema?.();
  }
}
</script>

<template>
  <PlSidebarGroup>
    <template #item-0>
      <AnnotationsSidebar
        v-model:annotation="annotation"
        v-model:selectedStepId="selectedStepId"
        :class="$style.sidebarItem"
        :columns="props.columns"
        @delete-schema="handleDeleteSchema"
      />
    </template>
    <template #item-1>
      <FilterSidebar
        v-if="selectedStep"
        v-model:step="selectedStep"
        :class="$style.sidebarItem"
        :columns="props.columns"
        :get-suggest-options="props.getSuggestOptions"
        :selectedStepId="selectedStepId"
        :hasSelectedColumns="props.hasSelectedColumns"
        :getValuesForSelectedColumns="props.getValuesForSelectedColumns"
      />
    </template>
  </PlSidebarGroup>
</template>

<style module>
.sidebarItem {
  width: 100%;
  height: 100%;
}
</style>
