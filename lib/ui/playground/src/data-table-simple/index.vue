<script lang="ts" setup>
import Layout from '@/Layout.vue';
import { DataTable } from '@milaboratory/platforma-uikit.lib';
import { computed, reactive } from 'vue';

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

const settings = computed(() => {
  const dataSource = new DataTable.RawData<DataRecord>(data.rows, 40, (row: DataRecord) => String(row.id) as DataTable.Types.PrimaryKey);

  return DataTable.settings<DataRecord>({
    columns: data.columns,
    height: 600,
    dataSource,
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
    onEdit(cell, value) {
      const row = data.rows.find((row, index) => dataSource.getPrimaryKey(row, index) === cell.row.primaryKey);
      if (row) {
        const id = cell.column.id;
        if (id === 'id') {
          row[id] = value as number;
        }
      }
      return true;
    },
    controlColumn: true,
  });
});
</script>

<template>
  <layout>
    <div v-if="false" style="display: flex">
      <pre>{{ settings }}</pre>
    </div>
    <div style="display: flex; flex-direction: column; max-height: 800px; padding-top: 60px" class="mb-6">
      <data-table-component style="flex: 1" :settings="settings" />
    </div>
  </layout>
</template>

<style lang="scss">
//
</style>
