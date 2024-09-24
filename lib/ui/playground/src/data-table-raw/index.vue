<script lang="ts" setup>
import Layout from '@/Layout.vue';
import { faker } from '@faker-js/faker';
import { randomInt } from '@milaboratory/helpers';
import { DataTable } from '@milaboratory/platforma-uikit.lib';
import { computed, onMounted, reactive } from 'vue';
import UserForm from './UserForm.vue';

const MyTable = DataTable.Component;

type DataRecord = {
  id: number;
  name: string;
  size: number;
  user: { name: string } | undefined;
};

const data = reactive<{ rows: DataRecord[]; modal: boolean }>({
  modal: false,
  rows: [
    {
      id: 1,
      name: 'Ivan',
      size: 100,
      user: {
        name: 'Ivan',
      },
    },
  ],
});

const createRandomRecord = () => {
  data.rows.push({
    id: data.rows.length + 1,
    name: faker.person.fullName(),
    size: randomInt(50, 80),
    user: {
      name: faker.person.fullName(),
    },
  });
};

const rowsRef = computed(() => data.rows);

const settings = DataTable.useRawData(rowsRef, {
  columns: [
    {
      id: 'id',
      label: 'ID',
      width: 60,
      valueType: 'integer',
      editable: true,
    },
    {
      id: 'name',
      label: 'Name',
      width: 120,
      valueType: 'string',
      editable: true,
    },
    {
      id: 'user',
      label: 'User',
      width: 420,
      valueType: 'unknown',
      component: () => UserForm,
      editable: true,
    },
    {
      id: 'size',
      label: 'Size',
      width: 120,
      valueType: 'integer',
      editable: true,
    },
  ],
  height: 600,
  resolvePrimaryKey(row) {
    return String(row.id);
  },
  resolveRowHeight(_row) {
    return 60;
  },
  onSelectedRows: [
    {
      label: 'Delete',
      cb: async (rows) => {
        data.rows = data.rows.filter((row) => !rows.some((r) => r.primaryKey === String(row.id)));
      },
    },
  ],
  onUpdatedRow(r) {
    const row = data.rows.find((row) => String(row.id) === r.primaryKey);
    console.log('dataRow', r.dataRow);
    if (row) {
      Object.assign(row, r.dataRow);
    }
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
  <Layout>
    <div style="display: flex" class="gap-12">
      <button @click="createRandomRecord">Create random</button>
      <span>last id: {{ data.rows.length }}</span>
      <span>last record: {{ data.rows[data.rows.length - 1] }}</span>
    </div>
    <div style="display: flex; flex-direction: column; max-height: 800px; padding-top: 60px" class="mb-6">
      <MyTable :settings="settings" style="flex: 1" />
    </div>
    <pre>{{ data.rows }}</pre>
  </Layout>
</template>
