<script lang="ts">
export default {
  inheritAttrs: false,
};
</script>

<script lang="ts" setup>
import type { MaskIconName, Size } from '@/lib/types';
import { computed, ref } from 'vue';
import MaskIcon from '@/lib/components/MaskIcon.vue';
import { useRipple } from '@/lib/composition/useRipple';

const props = defineProps<{
  loading?: boolean;
  small?: boolean;
  large?: boolean;
  size?: Size;
  round?: boolean;
  icon?: MaskIconName;
  reverse?: boolean;
  justifyCenter?: boolean;
  hover?: boolean;
}>();

const btn = ref();

const small = computed(() => props.small || props.size === 'small');
const large = computed(() => props.large || props.size === 'large');

useRipple(btn);
</script>

<template>
  <button
    ref="btn"
    tabindex="0"
    :class="{ loading, small, large, round, reverse, justifyCenter, hover, [$attrs.class + '']: true }"
    v-bind="{ ...$attrs, disabled: Boolean($attrs.disabled) || loading }"
  >
    <span v-if="!round">
      <slot />
    </span>
    <mask-icon v-if="loading" name="loader" />
    <mask-icon v-else-if="icon" :name="icon" />
  </button>
</template>
