<script lang="ts">
/**
 * A component for selecting one value from a list of options
 */
export default {
  name: 'PlTabs',
};
</script>

<script lang="ts" setup generic="M = unknown">
import style from './pl-tabs.module.scss';
import { computed } from 'vue';
import InnerBorder from '@/utils/InnerBorder.vue';
import type { SimpleOption } from '@/types';

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
   * List of available options for the component
   */
  options: Readonly<SimpleOption<M>[]>;
  /**
   * If `true`, the component is disabled and cannot be interacted with.
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

const normalizedOptions = computed(() =>
  props.options.map((it) => ({
    label: 'label' in it ? it.label : it.text,
    value: it.value,
  })),
);
</script>

<template>
  <div :class="[style.component, { [style.disabled]: disabled }]">
    <InnerBorder :class="style.container">
      <div
        v-for="(opt, i) in normalizedOptions"
        :key="i"
        :tabindex="modelValue === opt.value || disabled ? undefined : 0"
        :class="[{ [style.active]: modelValue === opt.value }, style.tab]"
        @keydown.enter="emitModel(opt.value)"
        @click="emitModel(opt.value)"
      >
        {{ opt.label }}
      </div>
    </InnerBorder>
    <div v-if="helper" :class="style.helper">{{ helper }}</div>
    <div v-else-if="error" :class="style.error">{{ error }}</div>
  </div>
</template>
