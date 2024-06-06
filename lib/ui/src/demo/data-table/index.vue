<script lang="ts" setup>
import Layout from '@/demo/Layout.vue';
import type { DataTableSettings } from '@/lib';
import { DataTable, SelectInput } from '@/lib';
import { utils, strings } from '@milaboratory/helpers';
import { faker } from '@faker-js/faker';
import { computed, reactive } from 'vue';
import { listToOptions } from '@milaboratory/helpers/utils';
import type { Data } from '@/lib/components/GridTable/types';

const rowsLength = 100000;

const cases = ['narrow', 'wide'] as const;

const caseOptions = listToOptions(cases);

type Case = (typeof cases)[number];

const data = reactive({
  case: 'wide' as Case,
  tableData: undefined as Data | undefined,
});

const columnsNumber = computed(() => {
  if (data.case === 'wide') {
    return 100;
  }

  return 5;
});

const columnsRef = computed(() => {
  const all = utils.arrayFrom(columnsNumber.value, (i) => {
    return {
      text: i + ') ' + faker.word.noun(),
      name: strings.uniqueId(),
      width: 100,
    } as DataTableSettings['columns'][number];
  });

  return [
    {
      text: 'ID',
      name: 'ID',
      width: 100,
    },
    ...all,
  ];
});

const rowsRef = computed(() => {
  return utils.arrayFrom(rowsLength, (id) => {
    return Object.fromEntries(
      columnsRef.value.map((col, colIndex) => {
        if (col.name === 'ID') {
          return [col.name, id];
        }

        return [col.name, colIndex % 2 === 0 ? utils.randomInt(0, 10) : strings.randomString(5)];
      }),
    );
  });
});

const settings = computed(() => {
  return <DataTableSettings>{
    columns: columnsRef.value,
    rows: rowsRef.value,
    selfSort: true,
  };
});

const onUpdateData = (v: Data) => (data.tableData = v);

const goDown = () => {
  if (data.tableData) {
    data.tableData.scrollTop = data.tableData.scrollTop + 100000;
  }
};
</script>

<template>
  <layout>
    <div style="display: flex; background-color: #fff; align-items: center" class="p-12 gap-24">
      <select-input v-model="data.case" style="width: 200px" :options="caseOptions" />
      rows: {{ rowsLength }} cols: {{ columnsNumber }} last id: {{ rowsRef[rowsRef.length - 1]['ID'] }}
      <button @click="goDown">Down</button>
    </div>
    <div v-if="false" style="display: flex; background-color: #fff; align-items: center; overflow: hidden" class="p-12 gap-24">
      {{ data.tableData }}
    </div>
    <div style="display: flex; flex-direction: column; max-height: 800px; border: 1px solid green">
      <data-table style="flex: 1" :settings="settings" @update:data="onUpdateData" />
    </div>
    <div v-if="false" style="display: flex">
      <pre>{{ settings }}</pre>
    </div>
  </layout>
</template>

<style lang="scss">
//
</style>
