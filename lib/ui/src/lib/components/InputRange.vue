<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';

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
}>();

const data = reactive({
  left: props.modelValue[0],
  right: props.modelValue[1],
});

const isFocused = ref(false);

const classes = computed(() => (isFocused.value ? 'ui-input-range-focused' : 'ui-input-range-focused'));

watch(
  () => props.modelValue,
  (value: [number, number]) => {
    (data.left = value[0]), (data.right = value[1]);
  },
);

function updateModel() {
  emit('update:modelValue', [+data.left, +data.right]);
}

function validateInput(isLeft: boolean, event: Event) {
  const value: string = (event.target as HTMLInputElement).value;
  const result = /^[0-9]{0,2}$/.test(value);
  if (!result) {
    if (isLeft) {
      data.left = +value.slice(0, value.length - 1);
    } else {
      data.right = +value.slice(0, value.length - 1);
    }
  }
}
</script>
<template>
  <div :class="classes" class="ui-input-range">
    <input
      v-model="data.left"
      class="text-s"
      type="text"
      @change="updateModel"
      @focus="isFocused = true"
      @focusout="isFocused = false"
      @input="validateInput(true, $event)"
    />
    <div class="ui-input-range__separator">{{ props.separator }}</div>
    <input
      v-model="data.right"
      class="text-s"
      type="text"
      @change="updateModel"
      @focus="isFocused = true"
      @focusout="isFocused = false"
      @input="validateInput(false, $event)"
    />
  </div>
</template>
