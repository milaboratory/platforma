<script lang="ts" setup>
import { computed } from 'vue';
import { useApp } from './app';
import Navigate from './components/Navigate.vue';
import { computedResult, isDefined } from '@platforma-sdk/ui-vue';

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

const sumOptional = computed(() => {
  const { x, y } = app.model.outputs;

  if (isDefined(x) && isDefined(y)) {
    return x + y;
  }

  return undefined;
});
</script>

<template>
  <div class="test-container">
    <Navigate />

    <div>Sum or error: {{ sumOrError }}</div>

    <div>{{ partial.value?.x }}</div>

    <div v-if="partial.value">(Partial) Sum: {{ partial.value.x }} + {{ partial.value.y }} = {{ partial.value.x + partial.value.y }}</div>
    <div v-else class="alert-error">Error: {{ partial.errors }}</div>

    <fieldset v-if="app.model.outputs.x !== undefined">
      <legend>x</legend>
      {{ app.model.outputs.x }}
    </fieldset>

    <fieldset v-if="app.model.outputs.y !== undefined">
      <legend>y</legend>
      {{ app.model.outputs }}
    </fieldset>

    <fieldset v-if="app.model.outputs !== undefined" class="alert-error">
      <legend>y error:</legend>
      {{ app.model.outputErrors.y }}
    </fieldset>

    <fieldset>
      <legend>Sum 2</legend>
      <div v-if="sum2.value">
        {{ sum2.value + 1 }}
      </div>
      <div v-if="sum2.errors">
        {{ sum2.errors }}
      </div>
    </fieldset>

    <div>sum optional: {{ sumOptional }}</div>

    <div>{{ app.model.outputs.x }}</div>

    <fieldset>
      <legend>Outputs</legend>
      <div>{{ app.model.outputs }}</div>
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
