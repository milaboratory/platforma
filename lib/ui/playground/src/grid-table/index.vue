<script lang="ts" setup>
import Layout from '@/Layout.vue';
import type { GridTableSettings } from '@milaboratory/platforma-uikit.lib';
import { GridTable } from '@milaboratory/platforma-uikit.lib';
import { utils, strings } from '@milaboratory/helpers';
import { faker } from '@faker-js/faker';
import { reactive } from 'vue';

const columnsLength = 5;

const rowsLength = 40;

const columnsData = utils.arrayFrom(columnsLength, () => {
  return {
    text: faker.word.noun(),
    name: strings.uniqueId(),
    sort: { direction: undefined },
  } as GridTableSettings['columns'][number];
});

const rowsData = utils.arrayFrom(rowsLength, (_i) => {
  return Object.fromEntries(columnsData.map((col, colIndex) => [col.name, colIndex % 2 === 0 ? utils.randomInt(0, 10) : strings.randomString(5)]));
});

const settings = reactive<GridTableSettings>({
  columns: columnsData,
  rows: rowsData,
  selfSort: true,
});

function onChangeSort(v: { colName: string; direction: 'ASC' | 'DESC' | undefined }) {
  console.log('new sort', JSON.stringify(v));
  const col = settings.columns.find((col) => col.name === v.colName);
  if (col) {
    col.sort = { direction: v.direction };
  }
}
</script>

<template>
  <layout>
    <div style="display: flex; max-height: 600px">
      <grid-table style="flex: 1" :settings="settings" @change:sort="onChangeSort" />
    </div>
    <div v-if="false" style="display: flex">
      <pre>{{ settings }}</pre>
    </div>
  </layout>
</template>

<style lang="scss">
//
</style>
