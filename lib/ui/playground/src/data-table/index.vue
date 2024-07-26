<script lang="ts" setup>
import Layout from '@/Layout.vue';
import { DataTable, NumberInput, BtnSecondary } from '@milaboratory/platforma-uikit.lib';
import { computed, onMounted } from 'vue';
import { useData } from './useData';
import { objectHash } from '@milaboratory/helpers';

const DataTableComponent = DataTable.Component;

const { data, columnsRef, generate } = useData();

const lastId = computed(() => (data.rows.length ? data.rows[data.rows.length - 1]['ID'] : undefined));

const settings = computed(() => {
  const dataSource = new DataTable.RawData(data.rows, 40, (row: Record<string, unknown>) => objectHash(row) as DataTable.Types.PrimaryKey);

  return DataTable.settings({
    columns: columnsRef.value,
    height: 600,
    dataSource,
    onDeleteRows(selectedRows) {
      data.rows = data.rows.filter((row) => !selectedRows.some((r) => r.primaryKey === objectHash(row)));
    },
    onDeleteColumns(columns) {
      alert(`Attempt to delete columns: ${JSON.stringify(columns)}`);
    },
    onEdit(cell, value) {
      const row = data.rows.find((row, index) => dataSource.getPrimaryKey(row, index) === cell.row.primaryKey);
      if (row) {
        row[cell.column.id] = value;
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
