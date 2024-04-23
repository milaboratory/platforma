<script lang="ts" setup>
import BtnGroup from './BtnGroup.vue';
import { MiXCR } from '@milaboratory/pl-core';

defineEmits(['update:modelValue']);

const props = withDefaults(
  defineProps<{
    modelValue: MiXCR.Types.AbundanceMeasure;
    label?: string;
  }>(),
  {
    label: 'Abundance Measure',
  },
);

const options = MiXCR.Constants.AbundanceMeasureOptions();
</script>

<template>
  <btn-group :label="label" :model-value="props.modelValue" :options="options" @update:model-value="$emit('update:modelValue', $event)" />
</template>
