<script lang="ts" setup>
import type { MaskIconName16 } from '../../types';
import { PlIcon } from '@/components/PlIcon';

const props = defineProps<{
  name: MaskIconName16;
  size?: number | string;
}>();
</script>

<template>
  <PlIcon :name="`16_${props.name}`" :class="['icon-16', $style.icon]" :width="props.size ?? 16" :height="props.size ?? 16" />
</template>

<style module>
.icon {
  display: inline-block;
}
</style>
