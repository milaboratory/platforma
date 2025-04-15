<script setup lang="ts" generic="M">
import { inject } from 'vue';
import { radioGroupModelKey, radioGroupNameKey } from './keys';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used by the props documentation
import type PlRadioGroup from './PlRadioGroup.vue';

const standaloneModel = defineModel<M>();

const { name: standaloneName, ...props } = defineProps<{
  /** Used to group multiple radio controls. Will be ignored if this component is a descendant of a {@link PlRadioGroup}. */
  name?: string;
  /** Value that goes into `v-model`. */
  value?: M;
  /** Whether the radio control is disabled. */
  disabled?: boolean;
}>();

defineSlots<{
  /** Label of the radio control. */
  default?(): unknown;
}>();

const name = inject(radioGroupNameKey, standaloneName);
const model = inject<typeof standaloneModel>(radioGroupModelKey, standaloneModel);
</script>

<template>
  <label :class="$style.container">
    <input v-model="model" :class="$style.input" type="radio" :name v-bind="props" />
    <span :class="$style.label"><slot /></span>
  </label>
</template>

<style module>
  .container {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    border-radius: 6px;
    transition: all 200ms ease-in-out;
    color: var(--txt-01);
    user-select: none;
    &:hover:not(:has(:disabled)) {
      background: var(--btn-sec-hover-grey);
    }
    &:has(:disabled) {
      color: var(--dis-01);
    }
  }

  .input {
    appearance: none;
    position: relative;
    block-size: 24px;
    aspect-ratio: 1;
    margin: 0;
    border-radius: 50%;
    outline: 2px solid transparent;
    color: inherit;
    transition: inherit;
    &:focus {
      outline-color: var(--border-color-focus);
    }
    &::before {
      content: "";
      position: absolute;
      inset: 2px;
      border-radius: 50%;
      border: 2px solid;
    }
    &::after {
      content: "";
      position: absolute;
      inset: 7.5px;
      border-radius: 50%;
      background-color: currentColor;
      scale: 0;
      transition: inherit;
    }
    &:checked::after {
      scale: 1;
    }
  }

  .label {
    padding-inline: 4px;
    line-height: calc(20 / 14);
    font-weight: 500;
    text-box: trim-both cap alphabetic;
  }
</style>
