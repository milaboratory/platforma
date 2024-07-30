<script lang="ts" setup>
import Dropdown from '@/components/Dropdown.vue';
import { datum } from '@milaboratory/platforma-core';

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
  <Dropdown label="Gene Feature" :model-value="modelValue" :options="options" @update:model-value="$emit('update:modelValue', $event)" />
</template>
