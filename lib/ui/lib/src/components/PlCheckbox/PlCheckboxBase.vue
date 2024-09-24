<script lang="ts" setup>
import './pl-checkbox-base.scss';
import { computed } from 'vue';

defineEmits(['update:modelValue']);

const props = defineProps<{
  modelValue: boolean;
  disabled?: boolean;
}>();

const checked = computed(() => props.modelValue);
</script>

<template>
  <div
    tabindex="0"
    class="pl-checkbox-base"
    :class="{ checked, disabled }"
    @click="$emit('update:modelValue', !modelValue)"
    @keydown.enter="$emit('update:modelValue', !modelValue)"
  />
</template>
