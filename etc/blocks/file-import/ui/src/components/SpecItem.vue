<script setup lang="ts">
import { PlBtnSecondary } from '@platforma-sdk/ui-vue';

defineProps<{
  title: string;
}>();

const emit = defineEmits<{
  remove: [];
}>();
</script>

<template>
  <div :class="$style.formGroup">
    <div :class="$style.itemHeader">
      <h4>{{ title }}</h4>
      <PlBtnSecondary @click="emit('remove')">Remove</PlBtnSecondary>
    </div>

    <slot />
  </div>
</template>

<style module>
.formGroup {
  border: 1px solid var(--border-color-div-grey);
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  background-color: var(--bg-elevated-01);
}

.itemHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color-div-grey);
}

.itemHeader h4 {
  margin: 0;
  color: var(--txt-01);
}

@media (max-width: 768px) {
  .itemHeader {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
}
</style>
