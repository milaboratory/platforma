<script setup lang="ts">
import { PlPureSlideModal } from "@milaboratories/uikit";
import { effect, shallowRef } from "vue";

import type { Annotation } from "../types";
import type { Props } from "./PlAnnotations.vue";
import PlAnnotations from "./PlAnnotations.vue";

// Models
const annotation = defineModel<Annotation>("annotation", { required: true });
const opened = defineModel<boolean>("opened", { required: true });
// Props
const props = defineProps<Props>();
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
      :class="$style.content"
      :columns="props.columns"
      :get-suggest-options="props.getSuggestOptions"
      :has-selected-columns="props.hasSelectedColumns"
      :getValuesForSelectedColumns="props.getValuesForSelectedColumns"
      @delete-schema="handleDeleteSchema"
    />
  </PlPureSlideModal>
</template>

<style module>
.modal {
  display: flex;
}

.content {
  width: 100%;
  height: 100%;
}
</style>
