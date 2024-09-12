<script lang="ts">
/**
 * A component for selecting one value from a list of options
 */
export default {
  name: 'PlBtnGroup',
};
</script>

<script lang="ts" setup generic="M = unknown">
import './pl-btn-group.scss';
import { useSlots } from 'vue';
import { PlTooltip } from '@/components/PlTooltip';
import InnerBorder from '@/utils/InnerBorder.vue';
import type { SimpleOption } from '@/types';

const slots = useSlots();

const emit = defineEmits<{
  /**
   * Emitted when the model value is updated.
   */
  (e: 'update:modelValue', value: M): void;
}>();

const emitModel = (v: M) => emit('update:modelValue', v);

defineProps<{
  /**
   * The current selected value.
   */
  modelValue?: M;
  /**
   * The label text for the dropdown field (optional)
   */
  label?: string;
  /**
   * List of available options for the dropdown
   */
  options: Readonly<SimpleOption<M>[]>;
  /**
   * If `true`, the dropdown component is disabled and cannot be interacted with.
   */
  disabled?: boolean;
  /**
   * A helper text displayed below the component when there are no errors (optional).
   */
  helper?: string;
  /**
   * Error message displayed below the component (optional)
   */
  error?: string;
}>();
</script>

<template>
  <div class="ui-btn-group" :class="{ disabled }">
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
        :key="i"
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
