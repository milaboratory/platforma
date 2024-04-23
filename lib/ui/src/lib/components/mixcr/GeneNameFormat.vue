<script lang="ts" setup>
import { BtnGroup } from '@milaboratory/pl-uikit';
import { MiXCR } from '@milaboratory/pl-core';

defineEmits(['update:modelValue']);

defineProps<{
  modelValue: MiXCR.Types.GeneNameFormat;
}>();

const options = MiXCR.Constants.GeneNameFormatOptions();
</script>

<template>
  <btn-group :model-value="modelValue" label="Gene name format" :options="options" @update:model-value="$emit('update:modelValue', $event)" />
</template>
