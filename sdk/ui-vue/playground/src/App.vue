<script setup lang="ts">
import { reactive } from 'vue';
import { FileDialog } from 'lib';
import { BtnPrimary } from '@milaboratory/platforma-uikit';
import '@milaboratory/platforma-uikit/dist/style.css';

const data = reactive({
  modalOpen: false,
});

const onUpdate = (files: unknown) => {
  console.log('files', files);
};
</script>

<template>
  <FileDialog v-model="data.modalOpen" @update:files="onUpdate" />
  <BtnPrimary @click.stop="data.modalOpen = true">Open dialog</BtnPrimary>
</template>

<style scoped>
.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}
.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}
.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>
