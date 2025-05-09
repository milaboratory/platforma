<script lang="ts" setup>
import './pl-checkbox-base.scss';

defineEmits(['update:modelValue']);

const props = defineProps<{
  modelValue: boolean;
  disabled?: boolean;
  indeterminate?: boolean;
}>();
</script>

<template>
  <div
    tabindex="0"
    class="pl-checkbox-base"
    :class="{
      ...(props.indeterminate
        ? { indeterminate: true }
        : { checked: props.modelValue }),
      disabled,
    }"
    @click="$emit('update:modelValue', !modelValue)"
    @keydown.space.prevent="$emit('update:modelValue', !modelValue)"
  />
</template>
