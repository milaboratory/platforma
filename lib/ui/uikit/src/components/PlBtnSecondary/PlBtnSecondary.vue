<script lang="ts">
/**
 * Secondary button
 */
export default {
  name: 'PlBtnSecondary',
};
</script>

<script lang="ts" setup>
import './pl-btn-secondary.scss';
import type { MaskIconName16, Size } from '../../types';
import BtnBase from '../../base/BtnBase.vue';

const props = defineProps<{
  /**
   * If `true,` the button is disabled, cannot be interacted with, and shows a special 'loading' icon.
   */
  loading?: boolean;
  /**
   * Size of the button, the default value is 'medium'
   */
  size?: Size;
  /**
   * If `true` the shape is round.
   */
  round?: boolean;
  /**
   * Icon to display
   */
  icon?: MaskIconName16;
  /**
   * If `true`, an icon is displayed before the text.
   */
  reverse?: boolean;
  /**
   * Justify text at the center
   */
  justifyCenter?: boolean;
}>();
</script>

<template>
  <BtnBase v-bind="props" class="pl-btn-secondary">
    <slot />
  </BtnBase>
</template>
