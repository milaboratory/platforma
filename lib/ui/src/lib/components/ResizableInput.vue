<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  modelValue?: string;
  placeholder?: string;
  value?: string;
  disabled?: boolean;
  maxWidth?: string;
}>();

const emit = defineEmits(['input', 'update:modelValue']);
const text = computed(() => props.modelValue || props.value);
const styles = computed(() => (props.maxWidth ? { maxWidth: props.maxWidth } : undefined));
function handleInput(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  emit('input', value);
  emit('update:modelValue', value);
}
</script>

<template>
  <div class="resizable-input">
    <span :style="styles" class="resizable-input__size-span">{{ text }}</span>
    <input v-bind="$attrs" :placeholder="placeholder" :value="props.value" :disabled="props.disabled" :style="styles" @input="handleInput" />
  </div>
</template>
