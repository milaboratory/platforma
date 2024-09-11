<script setup lang="ts">
import './resizable-input.scss';
import { computed } from 'vue';

const props = defineProps<{
  modelValue?: string;
  placeholder?: string;
  value?: string;
  disabled?: boolean;
  maxWidth?: string;
  width?: string;
}>();

const emit = defineEmits(['input', 'update:modelValue']);

const text = computed(() => {
  if (props.placeholder) {
    return props.placeholder;
  }
  return (props.modelValue || props.value)?.replace('"', '');
});

const styles = computed(() => {
  const stl: Record<string, string> = {};
  if (props.width) {
    stl['width'] = props.width;
  }
  if (props.maxWidth) {
    stl['maxWidth'] = props.maxWidth;
  }
  return stl;
});

function handleInput(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  emit('update:modelValue', value);
}
</script>

<template>
  <div class="resizable-input">
    <span :style="styles" class="resizable-input__size-span">{{ text }}</span>
    <input v-bind="$attrs" :placeholder="placeholder" :value="props.modelValue" :disabled="props.disabled" :style="styles" @input="handleInput" />
  </div>
</template>
