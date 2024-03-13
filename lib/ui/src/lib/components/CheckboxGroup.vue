<script lang="ts" setup>
import type { Option } from '@/lib/types';
import UiCheckbox from '@/lib/components/UiCheckbox.vue';

const emit = defineEmits(['update:modelValue']);

const props = defineProps<{
  modelValue: unknown[];
  label?: string;
  options: Option[];
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
      <ui-checkbox :disabled="disabled" :label="opt.text" :model-value="hasValue(opt.value)" @update:model-value="() => updateModel(opt.value)" />
      <label @click.stop="() => updateModel(opt.value)">{{ opt.text }}</label>
    </div>
  </div>
</template>

<style lang="scss">
.ui-checkbox-group {
  --color-label: var(--color-text);
  display: flex;
  flex-direction: column;
  font-family: var(--font-family-base);
  &.disabled {
    --color-label: var(--color-dis-01);
  }
  label {
    color: var(--color-label);
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
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    }
  }
}
</style>
