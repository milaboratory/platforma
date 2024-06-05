<script lang="ts" setup>
import Layout from '@/demo/Layout.vue';
import type { DataTableSettings } from '@/lib';
import { DataTable, SelectInput } from '@/lib';
import { utils, strings } from '@milaboratory/helpers';
import { faker } from '@faker-js/faker';
import { computed, reactive } from 'vue';
import { listToOptions } from '@milaboratory/helpers/utils';

const rowsLength = 2000;

const cases = ['narrow', 'wide'] as const;

const caseOptions = listToOptions(cases);

type Case = (typeof cases)[number];

const data = reactive({
  case: 'narrow' as Case,
});

const columnsNumber = computed(() => {
  if (data.case === 'wide') {
    return 20;
  }

  return 5;
});

const columnsRef = computed(() => {
  const all = utils.arrayFrom(columnsNumber.value, () => {
    return {
      text: faker.word.noun(),
      name: strings.uniqueId(),
      sort: { direction: undefined },
    } as DataTableSettings['columns'][number];
  });

  return [
    {
      text: 'ID',
      name: 'ID',
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

const onChangeSort = (v: { colName: string; direction: 'ASC' | 'DESC' | undefined }) => {
  console.log('new sort', JSON.stringify(v));
  const col = settings.value.columns.find((col) => col.name === v.colName);
  if (col) {
    col.sort = { direction: v.direction };
  }
};
</script>

<template>
  <layout>
    <div style="display: flex; background-color: #fff; align-items: center" class="p-12 gap-24">
      <select-input v-model="data.case" style="width: 200px" :options="caseOptions" />
      rows: {{ rowsLength }} last id: {{ rowsRef[rowsRef.length - 1]['ID'] }}
      <button>Down</button>
    </div>
    <div style="display: flex; height: 800px; flex-direction: column; border: 1px solid green">
      <data-table style="flex: 1" :settings="settings" @change:sort="onChangeSort" />
    </div>
    <div v-if="false" style="display: flex">
      <pre>{{ settings }}</pre>
    </div>
  </layout>
</template>

<style lang="scss">
//
</style>
