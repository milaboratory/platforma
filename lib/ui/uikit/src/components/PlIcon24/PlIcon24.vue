<script lang="ts" setup>
import type { MaskIconName24, Size } from '../../types';
import { PlSvg } from '../PlSvg';
import { computed } from 'vue';

const props = defineProps<{
  name: MaskIconName24;
  size?: number | string | Size;
  color?: string | string[];
  stroke?: string | string[];
}>();

const size = computed(() => {
  if (typeof props.size === 'string') {
    if (props.size === 'small') return 16;
    if (props.size === 'medium') return 24;
    if (props.size === 'large') return 32;
  }
  return props.size ?? 24;
});
</script>

<template>
  <PlSvg
    :name="`24_${props.name}`"
    :class="['icon-24', 'maks-24', `icon-${props.name}`, `mask-${props.name}`, $style.icon]"
    :width="size"
    :height="size"
    :color="props.color"
    :stroke="props.stroke"
  />
</template>

<style module>
.icon {
  display: inline-block;
}
</style>
