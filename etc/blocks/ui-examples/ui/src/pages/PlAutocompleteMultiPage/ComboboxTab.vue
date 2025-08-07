<script setup lang="ts">
import type { ListOptionBase } from '@platforma-sdk/ui-vue';
import { PlAutocompleteMulti } from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';

const data = reactive({
  selected: ['tag1', 'tag2'],
});

async function fetchModelOptions(values: string[]): Promise<ListOptionBase<string>[]> {
  return values.map((v) => ({ value: v, label: v }));
}

async function fetchOptions(str: string): Promise<ListOptionBase<string>[]> {
  if (str === '') {
    return [];
  }
  return [{ value: str, label: str }];
}
</script>

<template>
  <div class="d-flex flex-column gap-16" style="width: 400px">
    <PlAutocompleteMulti
      v-model="data.selected"
      label="String tags (combobox)"
      :required="true"
      :optionsSearch="fetchOptions"
      :modelSearch="fetchModelOptions"
      :debounce="0"
      :resetSearchOnSelect="true"
      :emptyOptionsText="`Enter tag name and press Enter`"
    />
  </div>
</template>
