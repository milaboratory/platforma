<script lang="ts" setup>
import { computed } from 'vue';
import type { MaskIconName24, Size } from '@/types';

const props = defineProps<{
  name: MaskIconName24;
  size?: Size;
}>();

const className = computed(() => `icon-24 icon-${props.name}`);
</script>

<template>
  <i :class="[className, $style.icon]" />
</template>

<style module>
.icon {
  display: inline-block;
}
</style>
