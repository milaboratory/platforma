<script lang="ts" setup>
import type { MaskIconName16, Size } from '../../types';
import { PlSvg } from '../PlSvg';
import { computed } from 'vue';

const props = defineProps<{
  name: MaskIconName16;
  size?: number | string | Size;
  color?: string | string[];
  stroke?: string | string[];
}>();

const size = computed(() => {
  if (typeof props.size === 'string') {
    if (props.size === 'small') return 12;
    if (props.size === 'medium') return 16;
    if (props.size === 'large') return 24;
  }
  return props.size ?? 16;
});
</script>

<template>
  <PlSvg :name="`16_${props.name}`" :class="['icon-16', $style.icon]" :width="size" :height="size" :color="props.color" :stroke="props.stroke" />
</template>

<style module>
.icon {
  display: inline-block;
}
</style>
