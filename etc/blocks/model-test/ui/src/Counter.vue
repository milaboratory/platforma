<script setup lang="ts">
import { ref } from "vue";
import { usePlugin, type InferPluginHandle } from "@platforma-sdk/ui-vue";
import type { CounterPlugin } from "@milaboratories/milaboratories.test-block-model.model";

const props = defineProps<{
  handle: InferPluginHandle<CounterPlugin>;
}>();

const plugin = usePlugin(props.handle);

// Plugin UI service test: pframeSpec (sync WASM)
const pluginSpecResult = ref("pending...");
try {
  const entry = plugin.services.pframeSpec.createSpecFrame({});
  entry.unref();
  pluginSpecResult.value = `ok (handle: ${entry.key})`;
} catch (e) {
  pluginSpecResult.value = `error: ${e}`;
}

// Plugin UI service test: pframe (async node)
const pluginPframeResult = ref("pending...");
plugin.services.pframe
  .listColumns("dummy-handle" as any)
  .then((r) => {
    pluginPframeResult.value = `ok (${r.length} columns)`;
  })
  .catch(() => {
    pluginPframeResult.value = "error (expected for dummy handle)";
  });

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
    <p style="color: blue">Model specFrame: {{ plugin.model.outputs.specFrameTest }}</p>
    <p style="color: green">Model pframe: {{ plugin.model.outputs.pframeTest }}</p>
    <p style="color: teal">UI pframeSpec: {{ pluginSpecResult }}</p>
    <p style="color: orange">UI pframe: {{ pluginPframeResult }}</p>
    <div style="display: flex; gap: 8px">
      <button @click="decrement">-</button>
      <button @click="increment">+</button>
    </div>
  </div>
</template>
