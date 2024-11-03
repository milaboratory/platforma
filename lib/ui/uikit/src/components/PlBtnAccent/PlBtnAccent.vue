<script lang="ts">
/**
 * Accent button
 */
export default {
  name: 'PlBtnAccent',
};
</script>

<script lang="ts" setup>
import './pl-btn-accent.scss';
import type { MaskIconName16, Size } from '@/types';
import BtnBase from '@/base/BtnBase.vue';

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
  <BtnBase class="pl-btn-accent" v-bind="props">
    <slot />
  </BtnBase>
</template>
