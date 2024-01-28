<script lang="ts" setup>
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
    class="ui-checkbox"
    :class="{ checked, disabled }"
    @click="$emit('update:modelValue', !modelValue)"
    @keydown.enter="$emit('update:modelValue', !modelValue)"
  />
</template>
