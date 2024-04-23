<script lang="ts" setup>
import { computed } from 'vue';
import { BtnGroup } from '@milaboratory/pl-uikit';
import { MiXCR } from '@milaboratory/pl-core';
// import { getGeneTypeMatchOptions } from '../impl/CloneBrowser/Data/constants';

defineEmits(['update:modelValue']);

const props = defineProps<{
  modelValue: MiXCR.Types.GeneType;
  only?: MiXCR.Types.GeneType[];
}>();

// ['V', 'J', 'C']
const options = computed(() =>
  MiXCR.Constants.GeneTypeOptions().filter((o) => {
    return !props.only || props.only.includes(o.value);
  }),
);
</script>

<template>
  <btn-group :model-value="modelValue" label="Gene type" :options="options" @update:model-value="$emit('update:modelValue', $event)" />
</template>
