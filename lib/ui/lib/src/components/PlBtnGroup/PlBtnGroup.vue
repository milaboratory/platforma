<script lang="ts" setup>
import { useSlots } from 'vue';
import { PlTooltip } from '@/components/PlTooltip';
import InnerBorder from '@/utils/InnerBorder.vue';
import type { Option } from '@/types';

const slots = useSlots();

const emit = defineEmits(['update:modelValue']);

const emitModel = (v: unknown) => emit('update:modelValue', v);

defineProps<{
  modelValue?: unknown;
  options: Readonly<Option[]>;
  label?: string;
  //FIXME unused props
  // clearable?: boolean;
  //FIXME unused props
  //required?: boolean;
  disabled?: boolean;
  large?: boolean;
  helper?: string;
  error?: string;
}>();
</script>

<template>
  <div class="ui-btn-group" :class="{ large, disabled }">
    <label v-if="label">
      <span>{{ label }}</span>
      <PlTooltip v-if="slots.tooltip" class="info" position="top">
        <template #tooltip>
          <slot name="tooltip" />
        </template>
      </PlTooltip>
    </label>
    <InnerBorder class="ui-btn-group__container">
      <div
        v-for="(opt, i) in options"
        :key="opt.value + ':' + i"
        class="ui-btn-group__option"
        :tabindex="modelValue === opt.value || disabled ? undefined : 0"
        :class="{ active: modelValue === opt.value }"
        @keydown.enter="emitModel(opt.value)"
        @click="emitModel(opt.value)"
      >
        {{ opt.text }}
      </div>
    </InnerBorder>
    <div v-if="helper" class="ui-btn-group__helper">{{ helper }}</div>
    <div v-else-if="error" class="ui-btn-group__error">{{ error }}</div>
  </div>
</template>
