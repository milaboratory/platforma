<script setup lang="ts">
defineProps<{
  modelValue: number;
}>();
</script>

<template>
  <div>
    <b>{{ modelValue }}</b>
  </div>
</template>

<style lang="scss" scoped>
// .my-info {
//   color: lightgreen;
// }
</style>
