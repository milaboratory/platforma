<script setup lang="ts">
defineProps<{
  value: number;
}>();
</script>

<template>
  <div>
    <b>{{ value }}</b>
  </div>
</template>

<style lang="scss" scoped>
// .my-info {
//   color: lightgreen;
// }
</style>
