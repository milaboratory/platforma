<script lang="ts" setup>
import { watch } from 'vue';
import { useApp } from './app';
import { PlNumberField, PlTextField } from '@platforma-sdk/ui-vue';

const app = useApp();

watch(() => app.model.ui, (newUi) => {
  app.model.args.y = newUi.label.length;
}, {immediate: true});
</script>

<template>
  <div class="test-container">
    <div>Args</div>

    <PlNumberField label="X" v-model="app.model.args.x" />
    <PlNumberField label="Y" v-model="app.model.args.y" />

    <div>Sum or error: {{ app.model.outputs.sum }}</div>

    <div>Sum or undefined: {{ app.model.outputs.sum }}</div>

    <div>Ui: {{ app.model.ui }}</div>

    <PlTextField v-model="app.model.ui.label" />

    <div>Error: {{ app.model.outputErrors.sum }}</div>
  </div>
</template>

<style lang="scss">
.test-container {
  width: 600px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
</style>

