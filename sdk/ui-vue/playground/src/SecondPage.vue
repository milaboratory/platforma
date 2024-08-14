<script lang="ts" setup>
import { computed } from 'vue';
import { useApp } from './app';
import Navigate from './components/Navigate.vue';
import { computedResult } from 'lib';

const app = useApp();

const partial = app.useOutputs('x', 'y');

const sumOrError = computed(() => {
  if (partial.value) {
    return partial.value.x + partial.value.y;
  }

  return partial.errors;
});

const sum2 = computedResult(() => {
  const { x, y } = app.unwrapOutputs('x', 'y');

  return x + y;
});
</script>

<template>
  <div class="test-container">
    <h3>Hi, I am Second Page</h3>
    <Navigate />

    <div>Sum or error: {{ sumOrError }}</div>

    <div>{{ partial.value?.x }}</div>

    <div v-if="partial.value">(Partial) Sum: {{ partial.value.x }} + {{ partial.value.y }} = {{ partial.value.x + partial.value.y }}</div>
    <div v-else class="alert-error">Error: {{ partial.errors }}</div>

    <fieldset>
      <legend>Sum 2</legend>
      <div v-if="sum2.value">
        {{ sum2.value + 1 }}
      </div>
      <div v-if="sum2.errors">
        {{ sum2.errors }}
      </div>
    </fieldset>

    <div>{{ app.outputs.x }}</div>

    <fieldset>
      <legend>Outputs</legend>
      <div>{{ app.outputs }}</div>
    </fieldset>
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
