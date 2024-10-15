<script lang="ts" setup>
import { useApp } from './app';
import { PlNumberField } from '@platforma-sdk/ui-vue';

const app = useApp();

const args = app.createArgsModel();

</script>

<template>
  <div class="test-container">
    <Navigate />

    <div>Args</div>

    <PlNumberField label="X" v-model="args.model.x" />
    <PlNumberField label="Y" v-model="args.model.y" />

    <div>Sum or error: {{ app.outputs.sum }}</div>

    <div>Sum or undefined: {{ app.model.outputs.sum }}</div>

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

