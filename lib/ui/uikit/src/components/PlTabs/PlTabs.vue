<script lang="ts">
/**
 * A component for selecting one value from a list of options
 */
export default {
  name: 'PlTabs',
};
</script>

<script lang="ts" setup generic="M extends string">
import style from './pl-tabs.module.scss';
import type { TabOption } from './types';
import Tab from './Tab.vue';

const emit = defineEmits<{
  /**
   * Emitted when the model value is updated.
   */
  (e: 'update:modelValue', value: M): void;
}>();

const emitModel = (v: M) => emit('update:modelValue', v);

defineProps<{
  /**
   * The current selected tab value.
   */
  modelValue?: M;
  /**
   * List of available options for the component
   */
  options: Readonly<TabOption<M>[]>;
  /**
   * If `true`, the component is disabled and cannot be interacted with.
   */
  disabled?: boolean;
  /**
   * If `true`, the `active` line appears on the top of element.
   */
  topLine?: boolean;
  /**
   * Maximum tab width (css value), can be overridden for each option
   */
  maxTabWidth?: string;
}>();
</script>

<template>
  <div :class="[style.component, { [style.disabled]: disabled, [style.topLine]: topLine }]">
    <Tab
      v-for="(opt, i) in options"
      :key="i"
      :tabindex="modelValue === opt.value || disabled || opt.disabled ? undefined : 0"
      :option="opt"
      :class="[{ [style.active]: modelValue === opt.value, [style.disabled]: opt.disabled }, style.tab]"
      :style="{ '--pl-tabs-item-max-width': opt.maxWidth ?? maxTabWidth }"
      @keydown.enter="emitModel(opt.value)"
      @click="emitModel(opt.value)"
    >
      <slot :name="opt.value" :option="opt">
        <span>{{ opt.label }}</span>
      </slot>
    </Tab>
  </div>
</template>
