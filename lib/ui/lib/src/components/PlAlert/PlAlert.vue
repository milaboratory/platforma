<script lang="ts">
export default {
  name: 'PlAlert',
};
</script>

<script lang="ts" setup>
import './pl-alert.scss';

defineEmits<{
  /**
   * Emitted when the model value is updated, typically when the close button is clicked.
   *
   * @param value - The new value of the model, generally `false` when the alert is closed.
   */
  (e: 'update:modelValue', value: boolean): void;
}>();

withDefaults(
  defineProps<{
    /**
     * Controls the visibility of the alert component. If `true`, the alert is visible.
     *
     * @default true
     */
    modelValue: boolean;
    /**
     * The type of alert, which determines the alert's style and icon.
     * Can be one of `'success' | 'info' | 'warn' | 'error'`.
     */
    type?: 'success' | 'info' | 'warn' | 'error';
    /**
     * An optional label that appears at the top of the alert.
     */
    label?: string;
    /**
     * If `true`, an icon corresponding to the alert type is displayed.
     */
    icon?: boolean;
    /**
     * If `true`, a close button is displayed in the alert, allowing the user to close it.
     */
    closeable?: boolean;
    /**
     * If `true`, the alert text is displayed in a monospace font.
     */
    monospace?: boolean;
    /**
     * If `true`, the alert content will preserve whitespace and line breaks.
     */
    whiteSpacePre?: boolean;

    /**
     * Max height (css value like '120px or 30%')
     */
    maxHeight?: string;
  }>(),
  {
    modelValue: true,
    type: undefined,
    label: undefined,
    icon: undefined,
    closeable: undefined,
    monospace: undefined,
    whiteSpacePre: undefined,
    maxHeight: undefined,
  },
);

const iconMap = {
  success: 'success',
  warn: 'warning',
  info: 'edit',
  error: 'error',
};
</script>

<template>
  <div v-if="modelValue" class="pl-alert" :style="{ maxHeight }" :class="[{ monospace, whiteSpacePre }, type ? `pl-alert__${type}` : '']">
    <div v-if="icon && type" class="pl-alert__icon">
      <div :class="`icon-24 icon-${iconMap[type]}`" />
    </div>
    <div class="pl-alert__main">
      <label v-if="label">{{ label }}</label>
      <div class="pl-alert__main__text"><slot /></div>
    </div>
    <div v-if="closeable" class="pl-alert__close-btn" aria-label="Close alert" role="button" @click="$emit('update:modelValue', false)" />
  </div>
</template>
