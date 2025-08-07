<script setup lang="ts">
import type { ListOptionBase } from '@platforma-sdk/ui-vue';
import { PlAutocompleteMulti, PlBtnPrimary } from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';
import { delay } from '@milaboratories/helpers';
import { faker } from '@faker-js/faker';

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
  selected: ['1'],
  sourceId: '1',
});

async function fetchModelOptions(values: string[]): Promise<ListOptionBase<string>[]> {
  return db.filter((el) => values.includes(el.value));
}

async function fetchOptions(str: string): Promise<ListOptionBase<string>[]> {
  str = str.toLowerCase();
  await delay(1000);
  if (str.includes('error')) {
    throw new Error('test error');
  }
  return Promise.resolve(
    db.filter((el) => el.value.toLowerCase().includes(str) || el.label.toLowerCase().includes(str)).slice(0, 100),
  );
}
</script>

<template>
  <div class="d-flex flex-column gap-16" style="width: 400px">
    <PlAutocompleteMulti
      v-model="data.selected"
      label="Autocomplete"
      :required="true"
      :optionsSearch="fetchOptions"
      :modelSearch="fetchModelOptions"
      :source-id="data.sourceId"
    />
    <PlBtnPrimary style="width: 120px" @click="data.sourceId = String(Math.random())">Change source id</PlBtnPrimary>
  </div>
</template>
