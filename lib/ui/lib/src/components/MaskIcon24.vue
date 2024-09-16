<script lang="ts" setup>
import { computed } from 'vue';
import type { MaskIconName16, Size } from '@/types';

const props = defineProps<{
  name: MaskIconName16;
  size?: Size;
}>();

const style = computed(() => (props.size === 'large' ? '--mask-size: 24px' : ''));

const className = computed(() => `mask-24 mask-${props.name}`);
</script>

<template>
  <i :style="style" :class="className" />
</template>
