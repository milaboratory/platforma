<script lang="ts" setup>
import type { MaskIconName16, Size } from '@/types';
import MaskIcon16 from '@/components/MaskIcon16.vue';
import { computed, ref, useSlots } from 'vue';
import { useRipple } from '@/composition/useRipple';

const props = withDefaults(
  defineProps<{
    loading?: boolean;
    small?: boolean;
    large?: boolean;
    size?: Size;
    round?: boolean;
    icon?: MaskIconName16;
    reverse?: boolean;
    justifyCenter?: boolean;
    hover?: boolean;
  }>(),
  {
    size: undefined,
    icon: undefined,
    justifyCenter: true,
  },
);

const small = computed(() => props.small || props.size === 'small');
const large = computed(() => props.large || props.size === 'large');

const btn = ref();

const slots = useSlots();

useRipple(btn);
</script>

<template>
  <button
    ref="btn"
    tabindex="0"
    class="ui-btn-ghost"
    :class="{ loading, small, large, round, reverse, justifyCenter, hover, [$attrs.class + '']: true }"
    v-bind="{ ...$attrs, disabled: Boolean($attrs.disabled) || loading }"
  >
    <span v-if="slots.default">
      <slot />
    </span>
    <MaskIcon16 v-if="loading" name="loading" :size="size" />
    <MaskIcon16 v-else-if="icon" :name="icon" :size="size" />
  </button>
</template>
