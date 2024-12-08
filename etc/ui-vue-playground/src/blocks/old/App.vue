<script lang="ts" setup>
import { onMounted } from 'vue';
import { createBlock } from './main';

onMounted(() => {
  createBlock();
});
</script>

<template>
  <div id="block-app"/>
</template>
