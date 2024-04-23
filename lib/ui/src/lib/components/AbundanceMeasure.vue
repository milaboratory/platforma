<script lang="ts" setup>
import BtnGroup from './BtnGroup.vue';
import { MiXCR } from '@milaboratory/pl-core';
import { listToOptions } from '../helpers/utils';

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

const options = listToOptions(MiXCR.Constants.AbundanceMeasureValues());
</script>

<template>
  <btn-group :label="label" :model-value="props.modelValue" :options="options" @update:model-value="$emit('update:modelValue', $event)" />
</template>
