<script lang="ts">
export default {
  inheritAttrs: false,
};
</script>

<script lang="ts" setup>
import type { MaskIconName16, Size } from '@/types';
import { computed, ref } from 'vue';
import { PlMaskIcon16 } from '@/components/PlMaskIcon16';
import { useRipple } from '@/composition/useRipple';

const props = defineProps<{
  loading?: boolean;
  small?: boolean;
  large?: boolean;
  size?: Size;
  round?: boolean;
  icon?: MaskIconName16;
  reverse?: boolean;
  justifyCenter?: boolean;
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
    :class="{ loading, small, large, round, reverse, justifyCenter, [$attrs.class + '']: true }"
    v-bind="{ ...$attrs, disabled: Boolean($attrs.disabled) || loading }"
  >
    <span v-if="!round">
      <slot />
    </span>
    <PlMaskIcon16 v-if="loading" name="loading" :size="size" />
    <PlMaskIcon16 v-else-if="icon" :name="icon" :size="size" />
  </button>
</template>
