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
import { computed, useSlots } from 'vue';
import { PlTooltip } from '../../components/PlTooltip';
import InnerBorder from '../../utils/InnerBorder.vue';
import type { SimpleOption } from '../../types';

const slots = useSlots();

const emit = defineEmits<{
  /**
   * Emitted when the model value is updated.
   */
  (e: 'update:modelValue', value: M): void;
}>();

const emitModel = (v: M) => emit('update:modelValue', v);

const props = defineProps<{
  /**
   * The current selected value.
   */
  modelValue?: M;
  /**
   * The label text for the component (optional)
   */
  label?: string;
  /**
   * List of available options for the component
   */
  options: Readonly<SimpleOption<M>[]>;
  /**
   * If `true`, the component is disabled and cannot be interacted with.
   */
  disabled?: boolean;
  /**
   * If `true`, the height of the component is 32px
   */
  compact?: boolean;
  /**
   * A helper text displayed below the component when there are no errors (optional).
   */
  helper?: string;
  /**
   * Error message displayed below the component (optional)
   */
  error?: string;
}>();

const normalizedOptions = computed(() =>
  props.options.map((it) => ({
    label: 'label' in it ? it.label : it.text,
    value: it.value,
  })),
);
</script>

<template>
  <div class="pl-btn-group" :class="{ disabled, compact }">
    <label v-if="label">
      <span>{{ label }}</span>
      <PlTooltip v-if="slots.tooltip" class="info" position="top">
        <template #tooltip>
          <slot name="tooltip" />
        </template>
      </PlTooltip>
    </label>
    <InnerBorder class="pl-btn-group__container">
      <div
        v-for="(opt, i) in normalizedOptions"
        :key="i"
        class="pl-btn-group__option text-s"
        :tabindex="modelValue === opt.value || disabled ? undefined : 0"
        :class="{ active: modelValue === opt.value }"
        @keydown.enter="emitModel(opt.value)"
        @click="emitModel(opt.value)"
      >
        {{ opt.label }}
      </div>
    </InnerBorder>
    <div v-if="helper" class="pl-btn-group__helper">{{ helper }}</div>
    <div v-else-if="error" class="pl-btn-group__error">{{ error }}</div>
  </div>
</template>
