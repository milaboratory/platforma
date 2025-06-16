<script lang="ts" setup>
import type { MaskIconName24 } from '../../types';
import { PlIcon } from '@/components/PlIcon';

const props = defineProps<{
  name: MaskIconName24;
}>();
</script>

<template>
  <PlIcon :name="`24_${props.name}`" :class="['icon-24', $style.icon]" />
</template>

<style module>
.icon {
  display: inline-block;
}
</style>
