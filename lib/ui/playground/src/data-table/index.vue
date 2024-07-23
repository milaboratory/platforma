<script lang="ts" setup>
import Layout from '@/Layout.vue';
import { DataTable, NumberInput, BtnSecondary } from '@milaboratory/platforma-uikit.lib';
import { computed, onMounted } from 'vue';
import { useData } from './useData';

const DataTableComponent = DataTable.Component;

const { data, columnsRef, generate } = useData();

const lastId = computed(() => (data.rows.length ? data.rows[data.rows.length - 1]['ID'] : undefined));

const getPrimaryKey = (row: Record<string, unknown>) => JSON.stringify(row);

const settings = computed(() => {
  return DataTable.settings({
    columns: columnsRef.value,
    height: 600,
    dataSource: new DataTable.RawData(data.rows, 40),
    getPrimaryKey,
    onDeleteRows(rowIds: string[]) {
      data.rows = data.rows.filter((row) => !rowIds.includes(getPrimaryKey(row)));
    },
    onDeleteColumns(colIds: string[]) {
      alert(`Attempt to delete columns: ${colIds.join(',')}`);
    },
    onEdit(ev: { rowId: string; columnId: string; value: unknown }) {
      const row = data.rows.find((r) => getPrimaryKey(r) === ev.rowId);
      if (row) {
        row[ev.columnId] = ev.value;
      }
      return true;
    },
    controlColumn: true,
  });
});

const onUpdateData = (v: DataTable.Types.TableData): void => {
  data.tableData = v;
};

const goDown = () => {
  if (data.tableData) {
    data.tableData.scrollTop = data.tableData.scrollTop + 100000;
  }
};

const onGenerate = () => {
  data.loading = true;
  generate().finally(() => {
    data.loading = false;
  });
};

onMounted(onGenerate);
</script>

<template>
  <layout>
    <div style="display: flex; background-color: #fff; align-items: center; overflow: scroll" class="p-12 gap-24 mb-6">
      <number-input v-model="data.numColumns" label="Num columns" />
      <number-input v-model="data.numRows" label="Num rows" />
      <btn-secondary :loading="data.loading" @click="onGenerate">Generate</btn-secondary>
      <span>rows: {{ data.rows.length }}</span>
      <span>cols: {{ data.numColumns }}</span>
      <span>last id: {{ lastId }}</span>
      <span>scrollLeft: {{ data.tableData?.scrollLeft }}</span>
      <button @click="goDown">Down</button>
    </div>
    <div v-if="false" style="display: flex">
      <pre>{{ settings }}</pre>
    </div>
    <div v-if="true" style="display: flex; background-color: #fff; align-items: center; overflow: hidden" class="p-12 gap-24 mb-6">
      {{ data.tableData?.bodyHeight }}
    </div>
    <div style="display: flex; flex-direction: column; max-height: 800px" class="mb-6">
      <data-table-component style="flex: 1" :settings="settings" @update:data="onUpdateData" />
    </div>
  </layout>
</template>

<style lang="scss">
//
</style>
