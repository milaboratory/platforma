<script lang="ts">
/** Container with vertical spacing */
export default {
  name: 'PlContainer',
};
</script>

<script lang="ts" setup>
import { computed } from 'vue';
import './pl-container.scss';
import PlSplash from '@/components/PlSplash/PlSplash.vue';

const props = defineProps<{
  /**
   * CSS width value (px, %)
   */
  width?: string;
  /**
   * Shows loading overlay
   */
  loading?: boolean;
  /**
   * Optional loading text
   */
  loadingText?: string;
}>();

const style = computed(() => ({
  width: props.width,
}));
</script>

<template>
  <PlSplash :loading="loading" :loading-text="loadingText" class="pl-container pl-layout-component" :style="style">
    <slot />
  </PlSplash>
</template>
