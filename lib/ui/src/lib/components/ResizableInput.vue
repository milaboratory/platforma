<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  modelValue?: string;
  placeholder?: string;
  value?: string;
  disabled?: boolean;
}>();

const emit = defineEmits(['input', 'update:modelValue']);
const text = computed(() => props.modelValue || props.value);
function handleInput(event: Event) {
  const value = (event.target as HTMLInputElement).value;
  emit('input', value);
  emit('update:modelValue', value);
}
</script>

<template>
  <div class="resizable-input">
    <span class="resizable-input__size-span">{{ text }}</span>
    <input v-bind="$attrs" :placeholder="placeholder" :value="props.value" :disabled="props.disabled" @input="handleInput" />
  </div>
</template>
