<script lang="ts" setup>
import { MiXCR } from '@milaboratory/pl-core';
import BtnGroup from './BtnGroup.vue';
import { listToOptions } from '@/lib/helpers/utils';

defineEmits(['update:modelValue']);

const options = listToOptions(MiXCR.Constants.AlphabetValues());

defineProps<{
  modelValue: MiXCR.Types.Alphabet;
}>();
</script>

<template>
  <btn-group :model-value="modelValue" label="Genetic Alphabet Type" :options="options" @update:model-value="$emit('update:modelValue', $event)" />
</template>
