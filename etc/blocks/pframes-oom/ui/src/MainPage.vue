<script setup lang="ts">
import { PlAlert, PlBlockPage, PlBtnPrimary } from "@platforma-sdk/ui-vue";
import { computed, ref } from "vue";
import { useApp } from "./app";

const app = useApp();
const running = ref(false);
const status = ref("Idle");

const ready = computed(() => {
  const table = app.model.outputs.table;
  return table?.rows === app.model.data.rows && table?.runId === app.model.data.runId;
});

async function run() {
  const table = app.model.outputs.table;
  if (!table || !ready.value || running.value) return;
  running.value = true;
  status.value = "Running native pframes join…";
  try {
    const shape = await app.services.pframe.getShape(table.handle);
    status.value = `Completed: ${shape.rows.toLocaleString()} rows. Increase the input size to exhaust more memory.`;
  } catch (error) {
    status.value = `Failed: ${String(error)}`;
  } finally {
    running.value = false;
    app.model.data.runId++;
  }
}
</script>

<template>
  <PlBlockPage>
    <template #title>PFrames OOM reproducer</template>
    <PlAlert type="warn">
      This intentionally exhausts native pframes memory and may crash the desktop worker. Save other
      work before starting. Opening this page does not start the join.
    </PlAlert>
    <label>
      Rows per input (1–100000)
      <input
        v-model.number="app.model.data.rows"
        type="number"
        min="1"
        max="100000"
        :disabled="running"
      />
    </label>
    <p>Expected joined rows: {{ (app.model.data.rows ** 2).toLocaleString() }}</p>
    <p>Use 10 rows for a smoke check, 10000 for stress, and increase if needed.</p>
    <PlBtnPrimary :disabled="running || !ready || app.hasErrors" @click="run">
      Run memory stress
    </PlBtnPrimary>
    <p>{{ status }}</p>
    <PlAlert v-if="app.hasErrors" type="error">{{ app.model.outputErrors }}</PlAlert>
  </PlBlockPage>
</template>
