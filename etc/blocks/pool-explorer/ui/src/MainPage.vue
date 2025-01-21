<script setup lang="ts">
import { PlBlockPage, PlBtnPrimary, PlBtnSecondary, PlCheckbox, PlChip, PlContainer, PlRow, PlSpacer, PlTextField } from '@platforma-sdk/ui-vue';
import { useApp } from './app';
import JsonView from './JsonView.vue';
import { computed, reactive, useTemplateRef } from 'vue';
import { containsValue } from './utils';

const app = useApp();

const data = reactive({
  search: '',
  withKeys: false,
  caseSensitive: true,
});

const filtered = computed(() => {
  const { allSpecs } = app.model.outputs;

  const search = data.search.trim();

  const { withKeys, caseSensitive } = data;

  if (!allSpecs) {
    return undefined;
  }

  const { entries, isComplete } = allSpecs;

  const result = {
    entries: search ? entries.filter((it) => containsValue(it, { search, withKeys, caseSensitive })) : entries,
    isComplete,
  };

  return {
    result,
    search,
  };
});

const editor = useTemplateRef('editor');
</script>

<template>
  <PlBlockPage>
    <template #title>
      Pool explorer 1
    </template>
    <template #append>
      <PlBtnPrimary size="small" :disabled="!editor" @click="editor?.fold()">Fold</PlBtnPrimary>
      <PlBtnSecondary size="small" :disabled="!editor" @click="editor?.unfold()">Unfold</PlBtnSecondary>
    </template>
    <PlRow align-center>
      <PlContainer width="400px">
        <PlTextField v-model="data.search" label="Filter Entries" clearable />
      </PlContainer>
      <PlCheckbox v-model="data.withKeys">With keys</PlCheckbox>
      <PlCheckbox v-model="data.caseSensitive">Case sensitive</PlCheckbox>
      <PlSpacer />
      <PlChip>Total entries: {{ filtered?.result.entries.length }}</PlChip>
    </PlRow>
    <JsonView v-if="filtered" ref="editor" :value="filtered.result" :highlight-string="filtered.search" />
  </PlBlockPage>
</template>
