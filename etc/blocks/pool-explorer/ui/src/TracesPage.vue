<script setup lang="ts">
import type { ColumnTrace } from "@milaboratories/milaboratories.pool-explorer.model";
import { PlAlert, PlBlockPage, PlChip, PlDropdown, PlRow } from "@platforma-sdk/ui-vue";
import { computed, ref } from "vue";
import { useApp } from "./app";

const app = useApp();

const selectedKey = ref<string>();

const columns = computed(() => app.model.outputs.columnTraces?.columns ?? []);

const options = computed(() =>
  columns.value
    .map((c) => ({ value: c.key, label: c.optionLabel }))
    .sort((a, b) => a.label.localeCompare(b.label)),
);

const selected = computed<ColumnTrace | undefined>(() =>
  columns.value.find((c) => c.key === selectedKey.value),
);
</script>

<template>
  <PlBlockPage>
    <template #title>Column traces</template>
    <PlRow align-center>
      <PlDropdown
        v-model="selectedKey"
        :options="options"
        label="Column"
        placeholder="Pick a column of the result pool"
        clearable
      />
      <PlChip>Columns: {{ columns.length }}</PlChip>
      <PlChip v-if="app.model.outputs.columnTraces && !app.model.outputs.columnTraces.isComplete">
        Pool is still loading
      </PlChip>
    </PlRow>

    <template v-if="selected">
      <dl :class="$style.facts">
        <dt>Native label</dt>
        <dd>{{ selected.nativeLabel ?? "—" }}</dd>
        <dt>Column name</dt>
        <dd>
          <code>{{ selected.name }}</code>
        </dd>
        <dt>Producing block</dt>
        <dd>
          <code>{{ selected.blockId }}</code>
        </dd>
      </dl>

      <PlAlert v-if="'traceError' in selected" type="error" label="Trace does not parse">
        {{ selected.traceError }}
      </PlAlert>
      <PlAlert v-else-if="selected.trace.length === 0" type="info">
        This column has no trace.
      </PlAlert>
      <table v-else :class="$style.steps">
        <thead>
          <tr>
            <th>#</th>
            <th>Label</th>
            <th>Type</th>
            <th>Importance</th>
            <th>Id</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(step, i) in selected.trace" :key="i">
            <td>{{ i + 1 }}</td>
            <td :class="$style.stepLabel">{{ step.label }}</td>
            <td>
              <code>{{ step.type }}</code>
            </td>
            <td>{{ step.importance ?? "—" }}</td>
            <td>
              <code>{{ step.id ?? "—" }}</code>
            </td>
          </tr>
        </tbody>
      </table>
      <p :class="$style.hint">
        Step 1 is where the data entered the project; the last step is the block that produced this
        column.
      </p>

      <details :class="$style.raw">
        <summary>Raw <code>pl7.app/trace</code></summary>
        <pre>{{ selected.rawTrace ?? "absent" }}</pre>
      </details>
    </template>
  </PlBlockPage>
</template>

<style module>
.facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 16px;
  margin: 0;
}

.facts dt {
  color: var(--txt-03);
}

.facts dd {
  margin: 0;
}

.steps {
  border-collapse: collapse;
  width: 100%;
}

.steps th,
.steps td {
  border-bottom: 1px solid var(--border-color-default);
  padding: 6px 12px;
  text-align: left;
  vertical-align: top;
}

.steps th {
  color: var(--txt-03);
  font-weight: 500;
}

.stepLabel {
  font-weight: 600;
  white-space: pre-wrap;
  word-break: break-word;
}

.hint {
  color: var(--txt-03);
  margin: 0;
}

.raw pre {
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
