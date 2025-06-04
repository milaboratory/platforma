<script lang="ts" setup>
import './pl-btn-link.scss';
import type { MaskIconName16, Size } from '../../types';
import BtnSecondary from '../../components/PlBtnSecondary/PlBtnSecondary.vue';
import { ref } from 'vue';

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
   * Icon to display
   */
  icon?: MaskIconName16;
  /**
   * If `true`, an icon is displayed before the text.
   */
  reverse?: boolean;
  /**
   * Justify text at the center (is `true` by default)
   */
  justifyCenter?: boolean;
  /**
   * If `true`, the button is disabled and cannot be interacted with.
   */
  disabled?: boolean;
}>();

const hover = ref(false);
</script>

<template>
  <div class="ui-btn-link" :class="{ disabled, loading, hover }" @mouseover="hover = true" @mouseleave="hover = false">
    <BtnSecondary round :hover="hover" v-bind="props" />
    <slot />
  </div>
</template>
