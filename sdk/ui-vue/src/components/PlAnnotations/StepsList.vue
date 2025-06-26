<script setup lang="ts">
import Step from './Step.vue';
import { useSortable } from '@platforma-sdk/ui-vue';
import type { AnnotationStepUi } from '@platforma-sdk/model';
import { ref } from 'vue';

defineProps<{
  steps: AnnotationStepUi[];
}>();

const emit = defineEmits<{
  (e: 'delete', index: number): void;
  (e: 'reorder', indices: number[]): void;
}>();

const removeStep = (index: number) => {
  emit('delete', index);
};

const listRef = ref<HTMLElement>();

useSortable(listRef, {
  handle: '.drag-handle',
  onChange(indices) {
    emit('reorder', indices);
  },
});
</script>

<template>
  <div ref="listRef" style="display: flex; flex-direction: column; gap: 6px;">
    <Step v-for="(step, i) in steps" :key="i" :step="step" :index="i" @delete="removeStep(i)" />
  </div>
</template>
