<script lang="ts" setup>
import FileModalTest from './components/FileModalTest.vue';
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 24px">
    <FileModalTest name="Single file dialog" />
    <FileModalTest :multi="true" name="Multiple files dialog" />
  </div>
</template>
