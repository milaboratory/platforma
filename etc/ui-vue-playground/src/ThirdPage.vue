<script lang="ts" setup>
import { useApp } from './app';
import Navigate from './components/Navigate.vue';
import { ValueOrErrorsComponent } from '@platforma-sdk/ui-vue';

const app = useApp();
</script>

<template>
  <div class="test-container">
    <h3>ValueOrErrorsComponent</h3>
    <Navigate />

    <ValueOrErrorsComponent v-slot="{ value }" :value-or-error="app.outputs.x"> X Value: {{ value }} </ValueOrErrorsComponent>
    <ValueOrErrorsComponent v-slot="{ value }" :value-or-error="app.outputs.y"> Y Value: {{ value }} </ValueOrErrorsComponent>
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
