<script setup lang="ts">
import type { ListOptionBase } from "@platforma-sdk/ui-vue";
import { PlAutocompleteMulti, PlBtnPrimary } from "@platforma-sdk/ui-vue";
import { reactive } from "vue";
import { delay } from "@milaboratories/helpers";
import { faker } from "@faker-js/faker";

const set = new Set<string>();

const db = Array.from({ length: 10000 }, (_, idx) => {
  let label = faker.word.noun();

  if (set.has(label)) {
    label += ` ${faker.word.noun()}`;
  }

  set.add(label);

  return { value: String(idx), label };
});

const data = reactive({
  selected: ["1"],
  sourceId: "1",
});

async function fetchOptions(
  str: string | string[],
  type: "value" | "label",
): Promise<ListOptionBase<string>[]> {
  await delay(1000);

  if (type === "value" && Array.isArray(str)) {
    const values = str;
    return db.filter((el) => values.includes(el.value));
  }

  if (type === "label" && typeof str === "string") {
    const lowerStr = str.toLowerCase();
    if (lowerStr.includes("error")) {
      throw new Error("test error");
    }
    return Promise.resolve(
      db
        .filter(
          (el) =>
            el.value.toLowerCase().includes(lowerStr) || el.label.toLowerCase().includes(lowerStr),
        )
        .slice(0, 100),
    );
  }

  throw new Error("Invalid arguments combination");
}
</script>

<template>
  <div class="d-flex flex-column gap-16" style="width: 400px">
    <PlAutocompleteMulti
      v-model="data.selected"
      label="Autocomplete"
      :required="true"
      :optionsSearch="fetchOptions"
      :source-id="data.sourceId"
    />
    <PlBtnPrimary style="width: 120px" @click="data.sourceId = String(Math.random())"
      >Change source id</PlBtnPrimary
    >
  </div>
</template>
