<script setup lang="ts">
import { usePlugin, type PluginHandle } from "@platforma-sdk/ui-vue";
import type { CounterPluginFactory } from "@milaboratories/milaboratories.test-block-model.model";

const props = defineProps<{
  instance: PluginHandle<CounterPluginFactory>;
}>();

const plugin = usePlugin(props.instance);

function increment() {
  plugin.model.data.count += 1;
  plugin.model.data.lastIncrement = new Date().toISOString();
}

function decrement() {
  plugin.model.data.count -= 1;
  plugin.model.data.lastIncrement = new Date().toISOString();
}
</script>

<template>
  <div v-if="plugin.model.data" style="border: 1px solid #ccc; padding: 16px; border-radius: 8px">
    <h3>Counter Plugin (output: {{ plugin.model.outputs.displayText }})</h3>
    <p>Count: {{ plugin.model.data.count }}</p>
    <p v-if="plugin.model.data.lastIncrement">
      Last changed: {{ plugin.model.data.lastIncrement }}
    </p>
    <div style="display: flex; gap: 8px">
      <button @click="decrement">-</button>
      <button @click="increment">+</button>
    </div>
  </div>
</template>
