<script setup lang="ts">
import { PlBlockPage, PlTextField } from "@platforma-sdk/ui-vue";
import { PlAutocompleteMulti } from "@platforma-sdk/ui-vue";
import { useApp } from "./app";

const app = useApp();

async function optionsSearch(s: string | string[], type: "label" | "value") {
  if (type === "value" && Array.isArray(s)) {
    return s.map((v) => ({ value: v, label: v }));
  }
  if (type === "label" && typeof s === "string") {
    s = s.replaceAll(" ", "-");
    if (s === "") return [];
    return [{ value: s, label: s }];
  }
  return [];
}
</script>

<template>
  <PlBlockPage>
    <PlTextField v-model="app.model.args.titleArg" label="Title" />
    <PlTextField v-model="app.model.args.subtitleArg" label="Subtitle" />
    <PlTextField v-model="app.model.args.badgeArg" label="Badge" />
    <PlAutocompleteMulti
      v-model="app.model.args.tagArgs"
      label="Tags"
      emptyOptionsText="Enter tag name and press Enter"
      resetSearchOnSelect
      :optionsSearch
      :debounce="0"
    />
    <details open>
      <summary>Plain output</summary>
      <pre>{{ app.model.outputs.delayedOutput }}</pre>
    </details>
    <details open>
      <summary>Status of output</summary>
      <pre>OK: {{ app.model.outputs.delayedOutputWithStatus.ok }}</pre>
    </details>
    <details open>
      <summary>Output with status</summary>
      <pre>{{ JSON.stringify(app.model.outputs.delayedOutputWithStatus, null, 2) }}</pre>
    </details>
  </PlBlockPage>
</template>
