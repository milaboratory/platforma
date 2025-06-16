<script lang="ts" setup>
import type { MaskIconName24 } from '../../types';
import { PlSvg } from '../PlSvg';

const props = defineProps<{
  name: MaskIconName24;
  size?: number | string;
}>();
</script>

<template>
  <PlSvg :name="`24_${props.name}`" :class="['icon-24', $style.icon]" :width="props.size ?? 24" :height="props.size ?? 24" />
</template>

<style module>
.icon {
  display: inline-block;
}
</style>
