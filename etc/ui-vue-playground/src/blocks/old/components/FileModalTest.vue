<script setup lang="ts">
import { reactive } from 'vue';
import { PlFileDialog } from '@platforma-sdk/ui-vue';
import { PlBtnPrimary } from '@milaboratories/uikit';
import { platforma } from '../model';

window.platforma = platforma;

defineProps<{
  name: string;
  multi?: boolean;
}>();

const data = reactive({
  modalOpen: false,
});

const onUpdate = (files: unknown) => {
  console.log('files', files);
};

// const app = useApp();
</script>

<template>
  <div class="d-flex column">
    <PlFileDialog v-model="data.modalOpen" :multi="multi" @update:files="onUpdate" />
    <PlBtnPrimary @click.stop="data.modalOpen = true">{{ name }}</PlBtnPrimary>
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
