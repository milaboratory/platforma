<script setup lang="ts">
import type { Component } from 'vue';
import { h } from 'vue';
import {
  PlBlockPage,
  PlAgOverlayLoading,
  PlAgOverlayNoRows,
  AgGridTheme
} from '@platforma-sdk/ui-vue';
import { AgGridVue } from '@ag-grid-community/vue3';
import type { ColDef, GridOptions } from '@ag-grid-community/core';
import { times } from '@milaboratories/helpers';
import { faker } from '@faker-js/faker';
import { PlAgCellFile, PlAgTextAndButtonCell } from '@platforma-sdk/ui-vue';

const LinkComponent: Component = {
  props: ['params'],
  setup(props) {
    return () =>
      h('a', { href: props.params.value, style: 'text-decoration: underline' }, props.params.value);
  }
};

const columnDefs: ColDef[] = [
  {
    colId: 'id',
    field: 'id',
    headerName: 'ID'
  },
  {
    colId: 'label',
    field: 'label',
    headerName: 'Sample label',
    cellRenderer: 'PlAgTextAndButtonCell'
  },
  {
    colId: 'description',
    field: 'description',
    headerName: 'Description'
  },
  {
    colId: 'file',
    field: 'file',
    headerName: 'File input',
    cellRenderer: 'PlAgCellFile',
    cellStyle: { padding: 0 }
  },
  {
    colId: 'link',
    field: 'link',
    headerName: 'Link',
    cellRenderer: 'LinkComponent'
  }
];

const result = times(100, () => {
  return {
    id: faker.number.int(),
    label: faker.company.buzzNoun(),
    description: faker.lorem.paragraph(),
    file: '',
    link: faker.internet.url()
  };
});

const gridOptions: GridOptions = {
  onRowDoubleClicked: (e) => {
    console.log('Example "Open" button was clicked', e);
  },
  components: {
    LinkComponent,
    PlAgCellFile,
    PlAgTextAndButtonCell
  }
};

const onGridReady = () => {};
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>AgGridVue</template>
    <AgGridVue
      :theme="AgGridTheme"
      :style="{ height: '100%' }"
      :row-data="result"
      :column-defs="columnDefs"
      :grid-options="gridOptions"
      :loading-overlay-component-params="{ notReady: true }"
      :loading-overlay-component="PlAgOverlayLoading"
      :no-rows-overlay-component="PlAgOverlayNoRows"
      @grid-ready="onGridReady"
    />
  </PlBlockPage>
</template>
