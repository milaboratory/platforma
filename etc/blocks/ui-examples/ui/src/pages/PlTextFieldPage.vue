<script setup lang="ts">
import { PlAlert, PlBlockPage, PlTextField } from "@platforma-sdk/ui-vue";
import { reactive } from "vue";

const data = reactive({
  text: "lorem ipsum",
  optionalText: "optional",
  num: "0",
  optionalNum: "" as string,
});

function numberRule(v: string): boolean | string {
  if (v === "") return true;
  const parsed = Number(v);
  if (!Number.isFinite(parsed)) return "Not a number";
  return true;
}
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <div class="d-flex flex-column gap-16" style="width: 400px">
      <PlTextField v-model="data.text" label="Text" placeholder="Text" />

      <PlTextField
        v-model="data.optionalText"
        label="Optional text (string | undefined)"
        placeholder="Now value is undefined"
        clearable
      />

      <PlTextField v-model="data.text" label="Password" placeholder="Password" type="password" />

      <PlTextField v-model="data.text" label="Disabled" disabled placeholder="Text" />

      <PlTextField
        v-model="data.text"
        label="Disabled Password"
        disabled
        placeholder="Password"
        type="password"
      />

      <div>Number (string) + clearable</div>
      <PlTextField
        v-model="data.num"
        placeholder="Number"
        :rules="[numberRule]"
        clearable
      />

      <div>Optional number (string)</div>
      <PlTextField
        v-model="data.optionalNum"
        placeholder="Number"
        :rules="[numberRule]"
        clearable
      />

      <PlAlert white-space-pre label="Data">
        {{ JSON.stringify(data, null, 2) }}
      </PlAlert>
    </div>
  </PlBlockPage>
</template>
