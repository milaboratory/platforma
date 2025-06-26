<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AnyForm, FilterUiType, FormField } from '@platforma-sdk/model';
import { getFilterUiMetadata } from '@platforma-sdk/model';
import DynamicForm from './DynamicForm.vue';

const emit = defineEmits<{
  (e: 'save-filter', filter: Record<string, unknown>): void;
  (e: 'close'): void;
}>();

const localModel = ref<Record<string, unknown>>({
  column: undefined,
  type: undefined,
});

const metadata = computed(() => {
  const filterType = localModel.value.type;
  if (!filterType) {
    return undefined;
  }
  return getFilterUiMetadata(filterType as FilterUiType);
});

const form = computed(() => {
  return metadata.value?.form ?? {
    column: {
      label: 'Column',
      fieldType: 'SUniversalPColumnId',
      defaultValue: () => undefined,
    },
    type: {
      label: 'Predicate',
      fieldType: 'FilterUiType',
      defaultValue: () => undefined as unknown as FilterUiType,
    },
  } as AnyForm;
});

const close = () => {
  emit('close');
  localModel.value = {};
};

defineExpose({
  localModel,
  close,
});
</script>

<template>
  <div :class="$style['filter-form']">
    <DynamicForm v-model="localModel" :form="form as Record<string, FormField>" />
  </div>
</template>

<style module>
.filter-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 0;
  pre {
    font-size: 8px;
    overflow: auto;
    max-height: 100px;
  }
}
</style>
