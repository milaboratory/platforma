<script lang="ts" setup>
import SelectInput from '@/lib/components/SelectInput.vue';
import { datum } from '@milaboratory/pl-core';

defineEmits(['update:modelValue']);

defineProps<{
  modelValue: string;
}>();

const options = datum.geneFeatures().map((o) => ({
  text: o.label,
  value: o.code,
}));
</script>

<template>
  <select-input label="Gene Feature" :model-value="modelValue" :options="options" @update:model-value="$emit('update:modelValue', $event)" />
</template>
