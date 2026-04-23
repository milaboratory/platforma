<script setup lang="ts">
import { PlPureSlideModal } from "@milaboratories/uikit";

import type { Props } from "./PlAnnotations.vue";
import PlAnnotations from "./PlAnnotations.vue";

const props = defineProps<
  Props & {
    opened: boolean;
    onUpdateOpened: (opened: boolean) => void;
  }
>();

async function handleDeleteSchema() {
  props.onUpdateOpened(false);
  props.onDeleteSchema?.();
}
</script>

<template>
  <PlPureSlideModal
    :model-value="props.opened"
    :class="$style.modal"
    width="768px"
    @update:model-value="props.onUpdateOpened"
  >
    <PlAnnotations
      :class="$style.content"
      :columns="props.columns"
      :annotation="props.annotation"
      :on-update-annotation="props.onUpdateAnnotation"
      :on-delete-schema="handleDeleteSchema"
      :has-selected-columns="props.hasSelectedColumns"
      :get-suggest-options="props.getSuggestOptions"
      :get-values-for-selected-columns="props.getValuesForSelectedColumns"
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
