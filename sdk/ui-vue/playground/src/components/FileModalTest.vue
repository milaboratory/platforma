<script setup lang="ts">
import { reactive } from 'vue';
import { FileDialog, usePlugin } from 'lib';
import { BtnPrimary } from '@milaboratory/platforma-uikit';
import '@milaboratory/platforma-uikit/dist/style.css';
import { BlockApp } from './app';

const data = reactive({
  modalOpen: false,
});

const onUpdate = (files: unknown) => {
  console.log('files', files);
};

const app = BlockApp.use();

const plugin = usePlugin();

plugin.age = 102;
</script>

<template>
  <div class="d-flex column">
    {{ app }}
    <FileDialog v-model="data.modalOpen" @update:files="onUpdate" />
    <BtnPrimary @click.stop="data.modalOpen = true">Open dialog</BtnPrimary>
    <blue-input />
    {{ plugin }}
  </div>
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
