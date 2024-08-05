<script lang="ts" setup>
import Layout from '@/Layout.vue';
import { DataTable } from '@milaboratory/platforma-uikit.lib';
import { computed } from 'vue';
import MyWorker from './worker?worker';
import type { WEvent, Person } from './worker';
import { Deferred } from '@milaboratory/helpers/utils';

const DataTableComponent = DataTable.Component;

class Api implements DataTable.Types.ExternalApi<Person> {
  private deferred: Deferred<Person[]> | undefined;

  constructor(private worker = new MyWorker()) {
    this.worker.onmessage = (e: { data: Person[] }) => {
      this.deferred?.resolve(e.data);
    };
  }
  query(options: { offset: number; limit: number }): Promise<Person[]> {
    return this.sendMessage({
      type: 'query',
      limit: options.limit,
      offset: options.offset,
    });
  }

  async count(): Promise<number> {
    return 20000;
  }

  sendMessage(ev: WEvent): Promise<Person[]> {
    this.deferred = new Deferred<Person[]>();
    this.worker.postMessage(ev);
    return this.deferred.promise;
  }
}

const api = new Api();

const settings = computed(() => {
  return DataTable.settings({
    columns: [
      {
        id: 'id',
        label: 'ID',
        valueType: 'integer',
        width: 100,
      },
      {
        id: 'name',
        label: 'Name',
        valueType: 'string',
        width: 300,
      },
      {
        id: 'gender',
        label: 'Gender',
        valueType: 'string',
        width: 300,
      },
      {
        id: 'job',
        label: 'Job',
        valueType: 'string',
        width: 300,
      },
    ],
    dataSource: new DataTable.AsyncData(api, 40, (row: Record<string, unknown>) => String(row.id)),
    height: 600,
    controlColumn: true,
  });
});

const test = () => {
  api
    .sendMessage({
      type: 'query',
      limit: 10,
      offset: 10,
    })
    .then((res) => {
      console.log(
        'got result',
        res.map((p) => p.id),
      );
    });
};
</script>

<template>
  <layout>
    <div style="display: flex; background-color: #fff; align-items: center; overflow: scroll" class="p-12 gap-24 mb-6">
      <button @click="test">Post</button>
    </div>
    <div v-if="false" style="display: flex">
      <pre>{{ settings }}</pre>
    </div>
    <div style="display: flex; flex-direction: column; max-height: 800px" class="mb-6">
      <data-table-component style="flex: 1" :settings="settings" />
    </div>
  </layout>
</template>

<style lang="scss">
//
</style>
