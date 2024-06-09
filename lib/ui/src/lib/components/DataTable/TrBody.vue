<script lang="ts" setup>
defineProps<{
  index: number;
  height: number;
}>();
</script>

<template>
  <div class="tr-body" :style="`height: ${height}px`">
    <slot />
  </div>
</template>
