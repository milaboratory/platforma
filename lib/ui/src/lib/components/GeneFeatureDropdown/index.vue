<script lang="ts" setup>
import SelectInput from '../SelectInput.vue';
import { getOptions } from './data';

defineEmits(['update:modelValue']);

defineProps<{
  modelValue: string;
}>();

const options = getOptions().map((o) => ({
  text: o.label,
  value: o.code,
}));
</script>

<template>
  <select-input label="Gene Feature" :model-value="modelValue" :options="options" @update:model-value="$emit('update:modelValue', $event)" />
</template>
