<script lang="ts" setup>
import Layout from '@/demo/Layout.vue';
import type { DataTableSettings } from '@/lib';
import { DataTable, SelectInput } from '@/lib';
import { utils, strings } from '@milaboratory/helpers';
import { faker } from '@faker-js/faker';
import { computed, reactive } from 'vue';
import { listToOptions, randomInt } from '@milaboratory/helpers/utils';
import type { Data } from '@/lib/components/DataTable/types';

const identity = <T,>(v: T): T => v;

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
    return 5;
  }

  return 5;
});

const columnsRef = computed(() => {
  const all = utils.arrayFrom(columnsNumber.value, (i) => {
    return {
      text: i + ') ' + faker.word.noun(),
      name: strings.uniqueId(),
      width: 200,
    } as DataTableSettings['columns'][number];
  });

  return [
    {
      text: 'ID',
      name: 'ID',
      width: 200,
    },
    ...all,
  ];
});

const lorem = strings.randomString(40);

const rowsRef = computed(() => {
  return utils.arrayFrom(rowsLength, (id) => {
    return Object.fromEntries(
      columnsRef.value.map((col, colIndex) => {
        if (col.name === 'ID') {
          return [col.name, id];
        }

        return [col.name, colIndex % 2 === 0 ? randomInt(0, 1000) : lorem];
      }),
    );
  });
});

const settings = computed(() => {
  return identity<DataTableSettings>({
    columns: columnsRef.value,
    datum: rowsRef.value,
    selfSort: true,
    rowHeight: 40,
  });
});

const onUpdateData = (v: Data): void => {
  data.tableData = v;
};

const goDown = () => {
  if (data.tableData) {
    data.tableData.scrollTop = data.tableData.scrollTop + 100000;
  }
};
</script>

<template>
  <layout>
    <div style="display: flex; background-color: #fff; align-items: center" class="p-12 gap-24 mb-6">
      <select-input v-model="data.case" style="width: 200px" :options="caseOptions" />
      rows: {{ rowsLength }} cols: {{ columnsNumber }} last id: {{ rowsRef[rowsRef.length - 1]['ID'] }}
      <button @click="goDown">Down</button>
    </div>
    <div v-if="false" style="display: flex; background-color: #fff; align-items: center; overflow: hidden" class="p-12 gap-24 mb-6">
      {{ data.tableData }}
    </div>
    <div style="display: flex; flex-direction: column; max-height: 800px" class="mb-6">
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
