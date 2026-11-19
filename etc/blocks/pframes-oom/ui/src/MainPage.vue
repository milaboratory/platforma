<script setup lang="ts">
import { MAX_INLINE_TEXT_CHARS } from "@milaboratories/milaboratories.test-pframes-oom.model";
import { PlAlert, PlBlockPage, PlBtnPrimary } from "@platforma-sdk/ui-vue";
import { computed, ref } from "vue";
import { useApp } from "./app";

const app = useApp();
const running = ref(false);
const status = ref("Idle");

// A table handle belongs to the parameters it was built from. Acting on one that
// the model has not yet rebuilt would stress the previous size, so each workload
// waits until its output reports the values currently in the form.
const nativeReady = computed(() => {
  const table = app.model.outputs.table;
  return table?.rows === app.model.data.rows && table?.runId === app.model.data.runId;
});
const heapReady = computed(() => {
  const table = app.model.outputs.heapTable;
  const data = app.model.data;
  return (
    table?.textRows === data.textRows &&
    table?.intRows === data.intRows &&
    table?.stringLength === data.stringLength &&
    table?.runId === data.runId
  );
});

const heapEstimate = computed(() => {
  const { textRows, intRows, stringLength } = app.model.data;
  const rows = textRows * intRows;
  const inlineChars = textRows * stringLength;
  return {
    rows,
    gb: (rows * stringLength) / 1024 ** 3,
    inlineChars,
    overBudget: inlineChars > MAX_INLINE_TEXT_CHARS,
  };
});

async function runNative() {
  const table = app.model.outputs.table;
  if (!table || !nativeReady.value || running.value) return;
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

async function runHeap() {
  const table = app.model.outputs.heapTable;
  if (!table || !heapReady.value || running.value) return;
  running.value = true;
  status.value = "Loading joined rows into the middle-layer worker heap…";
  try {
    const shape = await app.services.pframe.getShape(table.handle);
    const columnIndices = Array.from({ length: shape.columns }, (_, i) => i);
    const vectors = await app.services.pframe.getData(table.handle, columnIndices, {
      offset: 0,
      length: shape.rows,
    });
    status.value = `Completed: ${shape.rows.toLocaleString()} rows in ${vectors.length} vectors. The worker survived — raise the payload.`;
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
      This intentionally exhausts memory and may kill the desktop middle-layer worker. Save other
      work before starting. Opening this page starts nothing.
    </PlAlert>

    <h3>Native join — pressures the pframes engine</h3>
    <p>
      Only the table shape is requested, so the join stays inside native pframes and never reaches
      the worker heap.
    </p>
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
    <PlBtnPrimary :disabled="running || !nativeReady || app.hasErrors" @click="runNative">
      Run native join
    </PlBtnPrimary>

    <h3>Data delivery — pressures the worker heap</h3>
    <p>
      Every joined record is fetched. String values arrive as one JS string per record, so the
      payload lands in the middle-layer worker's own heap rather than in native memory. Integer
      columns would not: they arrive as typed arrays, which live outside that heap.
    </p>
    <label>
      Text records (1–10000)
      <input
        v-model.number="app.model.data.textRows"
        type="number"
        min="1"
        max="10000"
        :disabled="running"
      />
    </label>
    <label>
      Integer records (1–100000)
      <input
        v-model.number="app.model.data.intRows"
        type="number"
        min="1"
        max="100000"
        :disabled="running"
      />
    </label>
    <label>
      Characters per string (1–100000)
      <input
        v-model.number="app.model.data.stringLength"
        type="number"
        min="1"
        max="100000"
        :disabled="running"
      />
    </label>
    <p>
      Expected: {{ heapEstimate.rows.toLocaleString() }} joined rows,
      {{ heapEstimate.gb.toFixed(1) }} GB of strings.
    </p>
    <PlAlert v-if="heapEstimate.overBudget" type="warn">
      Text records x characters is {{ heapEstimate.inlineChars.toLocaleString() }} characters, above
      the {{ MAX_INLINE_TEXT_CHARS.toLocaleString() }} the block model's sandbox can hold. Lower
      either, and raise integer records instead: they multiply the payload without enlarging the
      input the model has to build.
    </PlAlert>
    <PlBtnPrimary :disabled="running || !heapReady || app.hasErrors" @click="runHeap">
      Load rows into worker heap
    </PlBtnPrimary>

    <p>{{ status }}</p>
    <PlAlert v-if="app.hasErrors" type="error">{{ app.model.outputErrors }}</PlAlert>
  </PlBlockPage>
</template>
