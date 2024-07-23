<script lang="ts" setup>
defineProps<{
  index: number;
  visible: boolean;
  height: number;
}>();
</script>

<template>
  <div class="t-row" :style="`height: ${height}px`">
    <slot v-if="visible" />
  </div>
</template>
