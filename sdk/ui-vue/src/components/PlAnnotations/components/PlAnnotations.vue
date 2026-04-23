<script lang="ts">
import type { Props as BaseProps } from "./FilterSidebar.vue";
export type Props = Omit<BaseProps, "step" | "onUpdateStep"> & {
  annotation: Annotation;
  onUpdateAnnotation: (annotation: Annotation) => void;
  onDeleteSchema?: () => void;
};
</script>

<script setup lang="ts">
import { computed, effect, shallowRef } from "vue";

import { isNil } from "@milaboratories/helpers";
import { produce } from "immer";
import { PlSidebarGroup, useConfirm } from "@milaboratories/uikit";

import type { Annotation, Filter } from "../types";
import AnnotationsSidebar from "./AnnotationsSidebar.vue";
import FilterSidebar from "./FilterSidebar.vue";

const props = defineProps<Props>();

const selectedStepId = shallowRef<undefined | number>(undefined);

const selectedStep = computed(() => {
  return isNil(selectedStepId.value) || isNil(props.annotation)
    ? undefined
    : props.annotation.steps.find((step) => step.id === selectedStepId.value);
});

effect(function setDefaultStepId() {
  if (selectedStepId.value === undefined && props.annotation.steps.length > 0) {
    selectedStepId.value = props.annotation.steps[0].id;
  }
});

const confirmResetSchema = useConfirm({
  title: "Reset Schema",
  message: "Are you sure you want to reset the schema? This action cannot be undone.",
  confirmLabel: "Yes, reset",
  cancelLabel: "No, cancel",
});

async function handleDeleteSchema() {
  if (await confirmResetSchema()) {
    selectedStepId.value = undefined;
    props.onDeleteSchema?.();
  }
}

function updateSelectedStepId(id: undefined | number) {
  selectedStepId.value = id;
}

function updateSelectedStep(step: Filter) {
  props.onUpdateAnnotation(
    produce(props.annotation, (draft) => {
      const idx = draft.steps.findIndex((s) => s.id === step.id);
      if (idx !== -1) {
        draft.steps[idx] = step;
      }
    }),
  );
}
</script>

<template>
  <PlSidebarGroup>
    <template #item-0>
      <AnnotationsSidebar
        :annotation="props.annotation"
        :selected-step-id="selectedStepId"
        :on-update-annotation="props.onUpdateAnnotation"
        :on-update-selected-step-id="updateSelectedStepId"
        :class="$style.sidebarItem"
        @delete-schema="handleDeleteSchema"
      />
    </template>
    <template #item-1>
      <FilterSidebar
        v-if="selectedStep"
        :step="selectedStep"
        :on-update-step="updateSelectedStep"
        :class="$style.sidebarItem"
        :columns="props.columns"
        :get-suggest-options="props.getSuggestOptions"
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
