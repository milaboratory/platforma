<script lang="ts" setup>
defineEmits(['update:modelValue']);

defineProps<{
  label?: string;
  modelValue?: boolean;
}>();
</script>

<template>
  <div
    tabindex="0"
    class="ui-toggle-switch"
    :class="{ active: modelValue }"
    @click="$emit('update:modelValue', !modelValue)"
    @keydown.enter="$emit('update:modelValue', !modelValue)"
  >
    <div class="ui-toggle-switch__body">
      <div class="ui-toggle-switch__handle" />
    </div>
    <span v-if="label" class="label">{{ label }}</span>
  </div>
</template>
