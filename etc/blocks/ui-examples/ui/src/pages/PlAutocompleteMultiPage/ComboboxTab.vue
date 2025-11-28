<script setup lang="ts">
import type { ListOptionBase } from '@platforma-sdk/ui-vue';
import { PlAutocompleteMulti } from '@platforma-sdk/ui-vue';
import { reactive } from 'vue';

const data = reactive({
  selected: ['tag1', 'tag2'],
});

async function fetchOptions(str: string | string[], type: 'value' | 'label'): Promise<ListOptionBase<string>[]> {
  if (type === 'value' && Array.isArray(str)) {
    return str.map((v) => ({ value: v, label: v }));
  }

  if (type === 'label' && typeof str === 'string') {
    if (str === '') return [];
    return [{ value: str, label: str }];
  }

  throw new Error('Invalid arguments combination');
}
</script>

<template>
  <div class="d-flex flex-column gap-16" style="width: 400px">
    <PlAutocompleteMulti
      v-model="data.selected"
      label="String tags (combobox)"
      :required="true"
      :optionsSearch="fetchOptions"
      :debounce="0"
      :resetSearchOnSelect="true"
      :emptyOptionsText="`Enter tag name and press Enter`"
    />
  </div>
</template>
