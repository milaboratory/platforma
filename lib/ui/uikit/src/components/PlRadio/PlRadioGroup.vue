<script setup lang="ts" generic="M">
import { provide } from 'vue';
import { radioGroupModelKey, radioGroupNameKey } from './keys';
import PlRadio from './PlRadio.vue';

type RadioGroupOption = {
  label: string;
  value: M;
  disabled?: boolean;
};

const model = defineModel<M>();

const props = defineProps<{
  /** Name of the radio group. */
  name?: string;
  /**
   * List of available options.
   * Renders a list of {@link PlRadio} components before the {@link slots.default | default} slot.
   */
  options?: Readonly<RadioGroupOption[]>;
  /** Function to get option's unique key. Use if default mechanism (key = index) is unstable. */
  keyExtractor?: (value: M, index: number) => PropertyKey;
}>();

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used by the props documentation
const slots = defineSlots<{
  /**
   * Can be anything, but usually an array of {@link PlRadio} components.
   * If {@link props.options|options} are provided, they will be rendered before this slot.
   */
  default?(): unknown;
  /** Label of the radio group. */
  label?(): unknown;
}>();

const keyExtractor = props.keyExtractor ?? ((_, i) => i);

provide(radioGroupNameKey, props.name);
provide(radioGroupModelKey, model);
</script>

<template>
  <fieldset :class="$style.container">
    <legend :class="$style.label">
      <slot name="label" />
    </legend>
    <PlRadio
      v-for="(option, i) in options"
      :key="keyExtractor(option.value, i)"
      :value="option.value"
      :disabled="option.disabled"
    >
      {{ option.label }}
    </PlRadio>
    <slot />
  </fieldset>
</template>

<style module>
  .container {
    margin: 0;
    padding: 0;
    border: none;
  }
  .label {
    margin-block-end: 12px;
    padding: 0;
    color: var(--txt-01);
    line-height: calc(20 / 14);
    font-weight: 500;
    text-box: trim-both cap alphabetic;
  }
</style>
