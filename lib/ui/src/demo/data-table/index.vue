<script lang="ts" setup>
import Layout from '@/demo/Layout.vue';
import type { DataTableSettings } from '@/lib';
import { DataTable, NumberInput, BtnSecondary } from '@/lib';
import { strings } from '@milaboratory/helpers';
import { faker } from '@faker-js/faker';
import { computed, onMounted, reactive } from 'vue';
import { randomInt, arrayFrom } from '@milaboratory/helpers/utils';
import type { ColumnSettings } from '@/lib/components/DataTable/types';
import { type TableData } from '@/lib/components/DataTable/types';
import { uniqueId } from '@milaboratory/helpers/strings';

const lorem = strings.randomString(40);

const tearRender = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

async function* renderSequence(n: number) {
  await tearRender();
  for (let i = 0; i < n; i++) {
    yield i;
    if (i % 1000 === 0) {
      await tearRender();
    }
  }
}

const asConst = <const T,>(v: T): T => v;

const data = reactive({
  loading: false,
  numColumns: 15,
  numRows: 100,
  tableData: undefined as TableData | undefined,
  rows: [] as Record<string, unknown>[],
});

const lastId = computed(() => (data.rows.length ? data.rows[data.rows.length - 1]['ID'] : undefined));

const columnsRef = computed(() => {
  const rest = arrayFrom(data.numColumns, (i) => {
    return {
      label: i + 2 + ') ' + faker.word.noun(),
      id: strings.uniqueId(),
      valueType: i % 2 === 0 ? 'string' : 'integer',
      width: 200,
      editable: true,
    } as DataTableSettings['columns'][number];
  });

  return [
    asConst<ColumnSettings>({
      id: uniqueId(),
      label: 'Frozen',
      width: 200,
      frozen: true,
    }),
    ...rest,
  ];
});

async function generate() {
  const rows = [] as Record<string, unknown>[];
  for await (const id of renderSequence(Number(data.numRows))) {
    const row = Object.fromEntries(
      columnsRef.value.map((col, colIndex) => {
        if (col.id === 'ID') {
          return [col.id, id];
        }

        return [col.id, colIndex % 2 === 0 ? randomInt(0, 1000) : lorem];
      }),
    );
    rows.push(row);
  }

  data.rows = rows;
}

const settings = computed<DataTableSettings>(() => {
  const getPrimaryKey = (row: Record<string, unknown>) => JSON.stringify(row);

  return asConst<DataTableSettings>({
    columns: columnsRef.value,
    datum: data.rows,
    getPrimaryKey,
    operations: {
      onDelete(ids) {
        data.rows = data.rows.filter((row) => !ids.includes(getPrimaryKey(row)));
      },
    },
    selfSort: true,
    rowHeight: 40,
    editable: true,
    cellEvents: ['delete:row', 'select:row'],
    controlColumn: true,
  });
});

function onDeleteRow(index: number) {
  data.rows.splice(index, 1);
}

const onUpdateData = (v: TableData): void => {
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
    <pre v-if="false">
      {{ data.rows }}
    </pre>
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
    <div v-if="false" style="display: flex; background-color: #fff; align-items: center; overflow: hidden" class="p-12 gap-24 mb-6">
      {{ data.tableData }}
    </div>
    <div style="display: flex; flex-direction: column; max-height: 800px" class="mb-6">
      <data-table style="flex: 1" :settings="settings" @update:data="onUpdateData" @delete:row="onDeleteRow" />
    </div>
  </layout>
</template>

<style lang="scss">
//
</style>
