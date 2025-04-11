<script setup lang="ts" generic="M extends string">
import { provide } from 'vue';
import { radioGroupModelKey, radioGroupNameKey } from './keys';

const model = defineModel<M>();
const props = defineProps<{
  name: string;
}>();
provide(radioGroupNameKey, props.name);
provide(radioGroupModelKey, model);

defineSlots<{
  /** Can be anything, but usually an array of PlRadio components. */
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
