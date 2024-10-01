<script lang="ts" setup>
import { onMounted } from 'vue';
import { createBlockSum } from './main';

onMounted(() => {
  createBlockSum();
});
</script>

<template>
  <div id="block-app"></div>
</template>