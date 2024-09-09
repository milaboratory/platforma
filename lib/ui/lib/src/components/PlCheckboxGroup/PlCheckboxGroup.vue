<script lang="ts" setup>
import type { ListOption } from '@/types';
import PlCheckboxBase from '@/components/PlCheckbox/PlCheckboxBase.vue';

const emit = defineEmits(['update:modelValue']);

const props = defineProps<{
  modelValue: unknown[];
  label?: string;
  options: ListOption[];
  disabled?: boolean;
}>();

function hasValue(value: unknown) {
  return props.modelValue.includes(value);
}

function updateModel(value: unknown) {
  const values = props.modelValue ?? [];
  emit('update:modelValue', hasValue(value) ? values.filter((v) => v !== value) : [...values, value]);
}
</script>

<template>
  <div class="ui-checkbox-group" :class="{ disabled }">
    <label v-if="label">{{ label }}</label>
    <div v-for="(opt, i) in options" :key="i">
      <PlCheckboxBase :disabled="disabled" :label="opt.text" :model-value="hasValue(opt.value)" @update:model-value="() => updateModel(opt.value)" />
      <label @click.stop="() => updateModel(opt.value)">{{ opt.text }}</label>
    </div>
  </div>
</template>

<style lang="scss">
.ui-checkbox-group {
  --color-label: var(--color-text);
  --cursor-label: pointer;
  display: flex;
  flex-direction: column;
  font-family: var(--font-family-base);
  &.disabled {
    --color-label: var(--color-dis-01);
    --cursor-label: default;
  }
  label {
    color: var(--color-label);
    cursor: var(--cursor-label);
  }
  > label {
    margin-bottom: 6px;
    font-size: 14px;
    font-weight: 600;
    line-height: 20px;
  }
  > div {
    height: 32px;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    > label {
      font-size: 14px;
      font-weight: 500;
    }
  }
}
</style>
