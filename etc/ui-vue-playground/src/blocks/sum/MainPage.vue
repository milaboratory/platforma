<script lang="ts" setup>
import { useApp } from './app';
import { PlNumberField } from '@platforma-sdk/ui-vue';

const app = useApp();
</script>

<template>
  <div class="test-container">
    <div>Args</div>

    <PlNumberField label="X" v-model="app.model.args.x" />
    <PlNumberField label="Y" v-model="app.model.args.y" />

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

