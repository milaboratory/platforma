<script lang="ts" setup>
import { MiXCR } from '@milaboratory/platforma-core';
import BtnGroup from '@/lib/components/BtnGroup.vue';

defineEmits(['update:modelValue']);

const options = MiXCR.Constants.AlphabetOptions();

defineProps<{
  modelValue: MiXCR.Types.Alphabet;
}>();
</script>

<template>
  <btn-group :model-value="modelValue" label="Genetic Alphabet Type" :options="options" @update:model-value="$emit('update:modelValue', $event)" />
</template>
