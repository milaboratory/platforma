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
  (e: 'change', val: [number, number]): void;
}>();

const data = reactive({
  left: props.modelValue[0],
  right: props.modelValue[1],
});

const isFocused = ref(false);

const classes = computed(() => (isFocused.value ? 'ui-input-range-focused' : 'ui-input-range-focused'));

const valuesModelText = computed({
  get() {
    return {
      left: Math.min(...props.modelValue),
      right: Math.max(...props.modelValue),
    };
  },
  set() {},
});
watch(
  () => valuesModelText.value,
  (value) => (data.left = value.left) && (data.right = value.right),
);
// watch(
//   () => props.modelValue,
//   (value: [number, number]) => {
//     console.log('model value updated');
//     (data.left = value[0]), (data.right = value[1]);
//   },
// );

function updateModel() {
  emit('update:modelValue', [+data.left, +data.right]);
  emit('change', [+data.left, +data.right]);
}

function validateInput(isLeft: boolean, event: Event) {
  const value: string = (event.target as HTMLInputElement).value;
  const result = /^[0-9]{0,2}$/.test(value);
  //if there is more than 3 digits we cut last one
  if (!result) {
    if (isLeft) {
      data.left = +value.slice(0, value.length - 1);
    } else {
      data.right = +value.slice(0, value.length - 1);
    }
  } else {
    if (isLeft) {
      data.left = +value;
    } else {
      data.right = +value;
    }
  }
}
</script>
<template>
  {{ data }}
  <div :class="classes" class="ui-input-range" v-bind="$attrs">
    <input
      v-model="valuesModelText.left"
      class="text-s"
      type="text"
      @change="updateModel"
      @focus="isFocused = true"
      @focusout="isFocused = false"
      @input="validateInput(true, $event)"
    />
    <div class="ui-input-range__separator">{{ props.separator }}</div>
    <input
      v-model="valuesModelText.right"
      class="text-s"
      type="text"
      @change="updateModel"
      @focus="isFocused = true"
      @focusout="isFocused = false"
      @input="validateInput(false, $event)"
    />
  </div>
</template>
