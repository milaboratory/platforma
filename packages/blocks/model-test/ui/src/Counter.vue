<script setup lang="ts">
import { usePluginData } from "@platforma-sdk/ui-vue";
import type {
  PluginNames,
  CounterPluginData,
} from "@milaboratories/milaboratories.test-block-model.model";

const props = defineProps<{
  name: PluginNames;
}>();

const { data, updateData } = usePluginData<CounterPluginData>(props.name);

function increment() {
  updateData((d) => ({
    ...d,
    count: d.count + 1,
    lastIncrement: new Date().toISOString(),
  }));
}

function decrement() {
  updateData((d) => ({
    ...d,
    count: d.count - 1,
    lastIncrement: new Date().toISOString(),
  }));
}
</script>

<template>
  <div v-if="data" style="border: 1px solid #ccc; padding: 16px; border-radius: 8px">
    <h3>Counter Plugin</h3>
    <p>Count: {{ data.count }}</p>
    <p v-if="data.lastIncrement">Last changed: {{ data.lastIncrement }}</p>
    <div style="display: flex; gap: 8px">
      <button @click="decrement">-</button>
      <button @click="increment">+</button>
    </div>
  </div>
</template>
