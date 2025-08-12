<script setup lang="ts" generic="T">
import type { ValueType } from '@milaboratories/milaboratories.file-import-block.model';
import {
  PlBtnPrimary,
  PlDropdown,
} from '@platforma-sdk/ui-vue';
import { isNil } from 'es-toolkit';
import { computed, ref } from 'vue';
import type { XsvMetadata } from '../hooks/useMetadataXsv';

const props = defineProps<{
  metadata?: XsvMetadata;
}>();

const emit = defineEmits<{
  add: [column: undefined | string, valueType: undefined | ValueType];
}>();

const selectedMetadataColumn = ref<undefined | string>(undefined);

const hasMetadata = computed(() => props.metadata && props.metadata.header.length > 0);
const metadataColumnOptions = computed(() =>
  props.metadata?.header.map((column) => ({
    label: column,
    value: column,
  })),
);

const handleAdd = () => {
  const column = selectedMetadataColumn.value;
  const valueType = (isNil(column) ? undefined : props.metadata?.types[column]);

  emit('add', column, valueType);
};
</script>

<template>
  <div v-if="hasMetadata" :class="$style.container">
    <PlDropdown
      v-model="selectedMetadataColumn"
      :class="$style.dropdown"
      :options="metadataColumnOptions"
      placeholder="Select metadata column"
      clearable
    />
    <PlBtnPrimary :class="$style.btn" @click="handleAdd">
      Add
    </PlBtnPrimary>
  </div>
</template>

<style module>
.container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dropdown {
  min-width: 200px;
}

.btn {
  min-width: auto;
}
</style>
