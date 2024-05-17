<script lang="ts" setup>
import BtnGroup from '@/lib/components/BtnGroup.vue';
import { MiXCR } from '@milaboratory/platforma-core';

defineEmits(['update:modelValue']);

const props = withDefaults(
  defineProps<{
    modelValue: MiXCR.Types.AbundanceType;
    label?: string;
  }>(),
  {
    label: 'Abundance Type',
  },
);

const options = MiXCR.Constants.AbundanceTypeOptions();
</script>

<template>
  <btn-group :label="label" :model-value="props.modelValue" :options="options" @update:model-value="$emit('update:modelValue', $event)" />
</template>
