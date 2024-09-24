<script lang="ts" setup>
import Layout from '@/Layout.vue';
import { DataTable, PlNumberField, PlBtnSecondary } from '@milaboratories/uikit';
import { computed, onMounted } from 'vue';
import { useData } from './useData';

const DataTableComponent = DataTable.Component;

const { data, columnsRef, generate } = useData();

const lastId = computed(() => (data.rows.length ? data.rows[data.rows.length - 1]['ID'] : undefined));

const settings = computed(() => {
  return DataTable.rawDataSettings(data.rows, {
    columns: columnsRef.value,
    height: 600,
    resolvePrimaryKey(_, index) {
      return String(index);
    },
    resolveRowHeight() {
      return 40;
    },
    onSelectedRows: [
      {
        label: 'Delete rows',
        cb: async (selectedRows) => {
          data.rows = data.rows.filter((_, i) => !selectedRows.some((r) => r.primaryKey === String(i)));
        },
      },
      {
        label: 'Duplicate rows',
        cb: async (selectedRows) => {
          alert('Operation "Duplicate rows" is not implemented' + selectedRows.length);
        },
      },
    ],
    onSelectedColumns: [
      {
        label: 'Delete columns',
        cb: async (columns) => {
          alert(`Attempt to delete columns: ${JSON.stringify(columns)}`);
        },
      },
    ],
    // onEditValue(cell) {
    //   const row = data.rows.find((_, index) => String(index) === cell.row.primaryKey);
    //   if (row) {
    //     row[cell.column.id] = cell.value;
    //   }
    //   return true;
    // },
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
  <Layout>
    <div style="display: flex; background-color: #fff; align-items: center; overflow: scroll" class="p-12 gap-24 mb-6">
      <PlNumberField v-model="data.numColumns" label="Num columns" />
      <PlNumberField v-model="data.numRows" label="Num rows" />
      <PlBtnSecondary :loading="data.loading" @click="onGenerate">Generate</PlBtnSecondary>
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
      <DataTableComponent style="flex: 1" :settings="settings" @update:data="onUpdateData" />
    </div>
  </Layout>
</template>
