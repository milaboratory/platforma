<script lang="ts" setup>
import Layout from '@/Layout.vue';
import { faker } from '@faker-js/faker';
import { randomInt } from '@milaboratory/helpers';
import { DataTable, DialogModal } from '@milaboratory/platforma-uikit.lib';
import { computed, onMounted, reactive } from 'vue';

type DataRecord = {
  id: number;
  name: string;
  size: number;
};

const data = reactive<{ rows: DataRecord[]; modal: boolean }>({
  modal: false,
  rows: [
    {
      id: 1,
      name: 'Ivan',
      size: 100,
    },
  ],
});

const createRandomRecord = () => {
  data.rows.push({
    id: data.rows.length + 1,
    name: faker.person.fullName(),
    size: randomInt(50, 80),
  });
};

const rowsRef = computed(() => data.rows);

const MyTable = DataTable.useRawDataComponent(rowsRef, {
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
      id: 'size',
      label: 'Size',
      width: 120,
      valueType: 'integer',
    },
  ],
  height: 600,
  resolvePrimaryKey(row) {
    return String(row.id);
  },
  resolveRowHeight(_row) {
    return _row.size;
  },
  onSelectedRows: [
    {
      label: 'Delete',
      cb: async (rows) => {
        data.rows = data.rows.filter((row) => !rows.some((r) => r.primaryKey === String(row.id)));
      },
    },
  ],
  onEditValue(cell, value) {
    const row = data.rows.find((row) => String(row.id) === cell.row.primaryKey);
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

onMounted(() => {
  setTimeout(() => {
    for (let i = 0; i < 25; i++) {
      createRandomRecord();
    }
  }, 1);
});
</script>

<template>
  <layout>
    <div v-if="false" style="display: flex">
      <pre>{{}}</pre>
    </div>
    <div style="display: flex" class="gap-12">
      <button @click="createRandomRecord">Create random</button>
      <span>last id: {{ data.rows.length }}</span>
      <span>last record: {{ data.rows[data.rows.length - 1] }}</span>
    </div>
    <div style="display: flex; flex-direction: column; max-height: 800px; padding-top: 60px" class="mb-6">
      <my-table style="flex: 1" />
    </div>
    <button @click="data.modal = true">Click me</button>
  </layout>
  <dialog-modal v-model="data.modal" />
</template>
