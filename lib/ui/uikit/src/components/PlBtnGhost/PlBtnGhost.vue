<script lang="ts">
/**
 * Ghost button
 */
export default {
  name: 'PlBtnGhost',
};
</script>

<script lang="ts" setup>
import './pl-btn-ghost.scss';
import type { MaskIconName24, Size } from '../../types';
import { PlMaskIcon24 } from '../../components/PlMaskIcon24';
import { computed, ref, useSlots } from 'vue';
import { useRipple } from '../../composition/useRipple';

const props = withDefaults(
  defineProps<{
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
    icon?: MaskIconName24;
    /**
     * If `true`, an icon is displayed before the text.
     */
    reverse?: boolean;
    /**
     * Justify text at the center (is `false` by default)
     */
    justifyCenter?: boolean;
  }>(),
  {
    size: undefined,
    icon: undefined,
    justifyCenter: false,
  },
);

const small = computed(() => props.size === 'small');
const large = computed(() => props.size === 'large');

const btnRef = ref();

const slots = useSlots();

useRipple(btnRef);
</script>

<template>
  <button
    ref="btnRef"
    tabindex="0"
    class="pl-btn-ghost"
    :class="{ loading, small, large, round, reverse, justifyCenter, [$attrs.class + '']: true }"
    v-bind="{ ...$attrs, disabled: Boolean($attrs.disabled) || loading }"
  >
    <span v-if="slots.default && !round">
      <slot />
    </span>
    <PlMaskIcon24 v-if="loading" name="loading" :size="size" />
    <PlMaskIcon24 v-else-if="icon" :name="icon" :size="size" />
    <slot name="append" />
  </button>
</template>
