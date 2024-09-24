<script lang="ts" setup>
import Layout from '@/Layout.vue';
import { DataTable } from '@milaboratory/platforma-uikit.lib';
import { reactive } from 'vue';

const DataTableComponent = DataTable.Component;

type DataRecord = {
  id: number;
  name: string;
  age: number;
};

const data = reactive<{ rows: DataRecord[]; columns: DataTable.Types.ColumnSpec<DataRecord>[] }>({
  rows: [
    {
      id: 1,
      name: 'Ivan',
      age: 100,
    },
    {
      id: 2,
      name: 'Petr',
      age: 300,
    },
    {
      id: 3,
      name: 'Michael',
      age: 300,
    },
  ],
  columns: [
    {
      id: 'id',
      label: 'ID',
      width: 60,
      valueType: 'integer',
    },
    {
      id: 'name',
      label: 'Name',
      width: 120,
      valueType: 'string',
    },
    {
      id: 'age',
      label: 'Age',
      width: 120,
      valueType: 'integer',
    },
  ],
});

const settings = DataTable.useRawData<DataRecord>(data.rows, {
  columns: data.columns,
  height: 600,
  resolvePrimaryKey: (row: DataRecord) => String(row.id),
  resolveRowHeight: () => 40,
  onSelectedRows: [
    {
      label: 'Delete',
      cb: async (rows) => {
        data.rows = data.rows.filter((row) => !rows.some((r) => r.primaryKey === String(row.id)));
      },
    },
  ],
  onSelectedColumns: [
    {
      label: 'Delete',
      cb: async (columns) => {
        data.columns = data.columns.filter((col) => !columns.some((c) => c.id === col.id));
      },
    },
  ],
  onUpdatedRow(tableRow) {
    const row = data.rows.find((row) => String(row.id) === tableRow.primaryKey);
    if (row) {
      Object.assign(row, tableRow.dataRow);
    }
  },
  controlColumn: true,
});
</script>

<template>
  <Layout>
    <div v-if="false" style="display: flex">
      <pre>{{ settings }}</pre>
    </div>
    <div style="display: flex; flex-direction: column; max-height: 800px; padding-top: 60px" class="mb-6">
      <DataTableComponent style="flex: 1" :settings="settings" />
    </div>
  </Layout>
</template>

<style lang="scss">
//
</style>
