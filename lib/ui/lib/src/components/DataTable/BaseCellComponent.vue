<script lang="ts" setup>
import { call } from '@milaboratory/helpers';
import type { ValueType } from './types';
import { computed, reactive, ref, unref } from 'vue';

const emit = defineEmits(['update:modelValue']);

const props = defineProps<{
  modelValue: unknown;
  valueType: ValueType | undefined;
  editable?: boolean;
}>();

const data = reactive({
  edit: false as boolean,
});

const valueTypeRef = computed(() => props.valueType);

const onInput = (ev: Event) => {
  let inputValue = (ev.target as HTMLInputElement)?.value;

  const valueType = unref(valueTypeRef);

  // @todo temp, replace to parse functions
  const value = call(() => {
    if (valueType === 'integer') {
      return parseInt(inputValue, 10);
    }

    if (valueType === 'float') {
      return Number(inputValue);
    }

    return inputValue;
  });

  emit('update:modelValue', value);

  data.edit = false;
};

const baseRef = ref<HTMLElement>();

const onClick = () => {
  if (props.editable) {
    data.edit = true;
    requestAnimationFrame(() => {
      baseRef.value?.querySelector('input')?.focus();
    });
  }
};
</script>

<template>
  <div ref="baseRef" class="base-cell" :class="{ edit: data.edit }" @click="onClick">
    <input v-if="data.edit" :value="modelValue" @focusout="data.edit = false" @change="onInput" />
    <div v-else>{{ modelValue }}</div>
  </div>
</template>
