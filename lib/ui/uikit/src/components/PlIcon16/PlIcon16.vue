<script lang="ts" setup>
import { computed } from 'vue';
import type { MaskIconName16, Size } from '../../types';

const props = defineProps<{
  name: MaskIconName16;
  size?: Size;
}>();

const style = computed(() => (props.size === 'large' ? '--icon-size: 24px' : ''));

const className = computed(() => `icon-16 icon-${props.name}`);
</script>

<template>
  <i :style="style" :class="[className, $style.icon]" />
</template>

<style module>
.icon {
  display: inline-block;
}
</style>
