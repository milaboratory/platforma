<script setup lang="ts">
defineProps<{
  value: unknown;
  info: string;
}>();
</script>

<template>
  <div>
    <b>custom:</b>
    <span>{{ value }}</span>
    <span class="my-info">({{ info }})</span>
  </div>
</template>

<style lang="scss" scoped>
.my-info {
  color: lightgreen;
}
</style>
