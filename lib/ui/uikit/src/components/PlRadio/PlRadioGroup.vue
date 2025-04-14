<script setup lang="ts" generic="M extends string">
import { provide } from 'vue';
import { radioGroupModelKey, radioGroupNameKey } from './keys';
import PlRadio from './PlRadio.vue';

type RadioItem = {
  label: string;
  value: M;
};

const model = defineModel<M>();
const props = defineProps<{
  /** Name of the radio group. */
  name: string;
  /**
   * List of available options.
   * Renders a list of {@link PlRadio} components before the {@link slots.default | default} slot.
   */
  options?: Readonly<RadioItem[]>;
}>();
provide(radioGroupNameKey, props.name);
provide(radioGroupModelKey, model);

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
</script>

<template>
  <fieldset :class="$style.container">
    <legend :class="$style.label">
      <slot name="label" />
    </legend>
    <PlRadio v-for="option in options" :key="option.value" :value="option.value">
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
