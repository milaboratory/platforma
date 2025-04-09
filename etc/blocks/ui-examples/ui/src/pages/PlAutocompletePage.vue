<script setup lang="ts">
import type { ListOption } from '@platforma-sdk/ui-vue';
import { PlBlockPage, PlAutocomplete } from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';
import { delay } from '@milaboratories/helpers';

const data = reactive({
  selected1: 'lorem ipsum',
  selected2: 'lorem ipsum',
  selected3: 'lorem ipsum',
});

const VERY_LONG_OPTIONS_ARRAY = new Array(100000).fill(null).map((_v, idx) => ({ value: `item${idx}`, label: `Label for item ${idx}` }));

async function requestOptions(str: string): Promise<ListOption[]> {
  await delay(1000);
  return Promise.resolve(VERY_LONG_OPTIONS_ARRAY.filter((el) => el.value.includes(str) || el.label.includes(str)).slice(0, 100));
}

</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <div class="d-flex flex-column gap-16" style="width: 400px">
      <PlAutocomplete
        v-model="data.selected1"
        label="Autocomplete"
        :optionsSearch="requestOptions"
      />
      <PlAutocomplete
        v-model="data.selected2"
        label="Autocomplete clearable"
        :optionsSearch="requestOptions"
        :clearable="true"
      />
      <PlAutocomplete
        v-model="data.selected3"
        label="Autocomplete with formatter"
        :optionsSearch="requestOptions"
        :clearable="true"
        :formatValue="(v: string) => v + ' formatted'"
      />
    </div>
  </PlBlockPage>
</template>
