<script lang="ts" setup>
import {MaskIconName, Size} from '@/lib/types';
import MaskIcon from '@/lib/components/MaskIcon.vue';
import {computed, ref, useSlots} from 'vue';
import {useRipple} from '@/lib/composition/useRipple';

const props = withDefaults( defineProps<{
  loading?: boolean;
  small?: boolean;
  large?: boolean;
  size?: Size;
  round?: boolean;
  icon?: MaskIconName;
  reverse?: boolean;
  justifyCenter?: boolean;
  hover?: boolean;
}>(), {
  justifyCenter: true
});

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
    :class="{loading, small, large, round, reverse, justifyCenter, hover, [$attrs.class + '']: true}"
    v-bind="{...$attrs, disabled: Boolean($attrs.disabled) || loading}"
  >
    <span v-if="slots.default">
      <slot/>
    </span>
    <mask-icon v-if="loading" name="loader"/>
    <mask-icon v-else-if="icon" :name="icon"/>
  </button>
</template>
