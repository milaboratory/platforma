<script setup lang="ts">
import { computed, reactive, ref, watch, toRefs } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: [number, number];
    separator?: string;
  }>(),
  {
    separator: '-',
  },
);

const emit = defineEmits<{
  (e: 'update:modelValue', val: [number, number]): void;
  (e: 'change', val: [number, number]): void;
}>();

const data = computed(() => ({
  left: Math.min(...props.modelValue),
  right: Math.max(...props.modelValue),
}));

const isFocused = ref(false);

const classes = computed(() => (isFocused.value ? 'ui-input-range-focused' : 'ui-input-range-focused'));

function updateModel() {
  emit('update:modelValue', [+data.value.left, +data.value.right]);
  emit('change', [+data.value.left, +data.value.right]);
  console.log('updateModel');
}

function validateInput(isLeft: boolean, event: Event) {
  const value: string = (event.target as HTMLInputElement).value;
  const result = /^[0-9]{0,2}$/.test(value);
  if (!result) {
    if (isLeft) {
      data.value.left = +value.slice(0, value.length - 1);
    } else {
      data.value.right = +value.slice(0, value.length - 1);
    }
  }
}
</script>
<template>
  {{ props.modelValue }}
  <div :class="classes" class="ui-input-range">
    <input
      :value="data.left"
      class="text-s"
      type="text"
      @change="updateModel"
      @focus="isFocused = true"
      @focusout="isFocused = false"
      @input="validateInput(true, $event)"
    />
    <div class="ui-input-range__separator">{{ props.separator }}</div>
    <input
      :value="data.right"
      class="text-s"
      type="text"
      @change="updateModel"
      @focus="isFocused = true"
      @focusout="isFocused = false"
      @input="validateInput(false, $event)"
    />
  </div>
</template>
