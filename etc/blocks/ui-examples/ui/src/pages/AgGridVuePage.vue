<script setup lang="ts">
import type { Component } from 'vue';
import { h, ref } from 'vue';
import {
  PlBlockPage,
  PlAgOverlayLoading,
  PlAgOverlayNoRows,
  AgGridTheme,
  PlAgDataTableToolsPanel
} from '@platforma-sdk/ui-vue';
import { AgGridVue } from '@ag-grid-community/vue3';
import type { ColDef, GridApi, GridOptions, GridReadyEvent } from '@ag-grid-community/core';
import { times } from '@milaboratories/helpers';
import { PlAgGridColumnManager } from '@platforma-sdk/ui-vue';
import { faker } from '@faker-js/faker';
import { PlAgCellFile, PlAgTextAndButtonCell, PlAgColumnHeader } from '@platforma-sdk/ui-vue';

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
    headerName: 'ID',
    headerComponent: PlAgColumnHeader,
    headerComponentParams: { type: 'Int' }
  },
  {
    colId: 'label',
    field: 'label',
    headerName: 'Sample label long text for overflow',
    cellRenderer: 'PlAgTextAndButtonCell',
    headerComponent: PlAgColumnHeader,
    headerComponentParams: { type: 'String' },
    cellRendererParams: {
      onClick: onClickHandler,
      invokeRowsOnDoubleClick: true
    }
  },
  {
    colId: 'date',
    field: 'date',
    headerName: 'Date',
    headerComponent: PlAgColumnHeader,
    headerComponentParams: { type: 'Date' }
  },
  {
    colId: 'file',
    field: 'file',
    headerName: 'File input',
    cellRenderer: 'PlAgCellFile',

    headerComponent: PlAgColumnHeader,
    headerComponentParams: { type: 'File' },
    cellStyle: { padding: 0 }
  },
  {
    colId: 'link',
    field: 'link',
    headerName: 'Link',
    headerComponent: PlAgColumnHeader,
    headerComponentParams: { type: 'String' },
    cellRenderer: 'LinkComponent'
  },
  {
    colId: 'time',
    field: 'time',
    headerName: 'Duration',
    headerComponent: PlAgColumnHeader,
    headerComponentParams: { type: 'Duration' }
  }
];

const result = times(100, () => {
  return {
    id: faker.number.int(),
    label: faker.company.buzzNoun(),
    date: faker.date.birthdate(),
    file: '',
    link: faker.internet.url(),
    time: `${faker.number.int()} h`
  };
});

function onClickHandler() {
  //will be invoked when invokeRowsOnDoubleClick: false
  console.log('onClickHandler');
}

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
let gridApi = ref<GridApi | null>(null);
const onGridReady = (e: GridReadyEvent) => {
  gridApi.value = e.api;
};
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>AgGridVue</template>
    <template #append>
      <PlAgDataTableToolsPanel>
        <PlAgGridColumnManager v-if="gridApi" :api="gridApi" />
      </PlAgDataTableToolsPanel>
    </template>

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
