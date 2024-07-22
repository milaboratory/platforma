<script lang="ts" setup>
import { computed } from 'vue';
import type { MaskIconName } from '@/lib/types';

const props = defineProps<{
  name: MaskIconName;
}>();

const className = computed(() => `mask mask--${props.name}`);
</script>

<template>
  <div :class="className" />
</template>
