<script lang="ts" setup>
import { computed } from 'vue';
import BtnGroup from '@/components/BtnGroup.vue';
import { MiXCR } from '@milaboratory/platforma-core';

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
