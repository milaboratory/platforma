<script setup lang="ts">
import type { Component } from 'vue';
import { computed, h, ref } from 'vue';
import {
  PlBlockPage,
  PlAgOverlayLoading,
  PlAgOverlayNoRows,
  AgGridTheme,
  PlAgDataTableToolsPanel,
  PlAgGridColumnManager,
  makeRowNumberColDef,
  autoSizeRowNumberColumn,
  PlAgCellFile,
  PlAgTextAndButtonCell,
  PlAgColumnHeader,
  type PlAgHeaderComponentParams,
  PlAgCsvExporter,
  PlAgCellProgress,
  defaultMainMenuItems,
  PlAgChartStackedBarCell,
  PlAgChartHistogramCell,
  Gradient,
} from '@platforma-sdk/ui-vue';
import { AgGridVue } from 'ag-grid-vue3';
import type { ColDef, GridApi, GridOptions, GridReadyEvent } from 'ag-grid-enterprise';
import { times } from '@milaboratories/helpers';
import { faker } from '@faker-js/faker';
import bins from './HistogramPage/assets/bins';

const LinkComponent: Component = {
  props: ['params'],
  setup(props) {
    return () =>
      h('a', { href: props.params.value, style: 'text-decoration: underline' }, props.params.value);
  },
};

const data = [{
  label: 'The best',
  value: 100,
}, {
  label: 'Good but not great',
  value: 60,
}, {
  label: 'A little worse',
  value: 40,
}, {
  label: 'Not good',
  value: 33,
}, {
  label: 'Awful',
  value: 330,
}, {
  label: 'Nightmare',
  value: 30,
}, {
  label: 'Hell',
  value: 30,
}];

const stackedSettings = computed(() => {
  const colors = Gradient('viridis').split(data.length);

  return {
    data: data.map((it, i) => ({ ...it, color: colors[i] })),
  };
});

const histogramSettings = computed(() => {
  return {
    type: 'log-bins' as const,
    title: 'Predefined bins (log x scale)',
    bins,
    threshold: 19.0,
    yAxisLabel: 'Number of UMIs',
    xAxisLabel: 'Number of reads per UMI',
  };
});

const columnDefs: ColDef[] = [
  makeRowNumberColDef(),
  {
    colId: 'id',
    field: 'id',
    headerName: 'ID',
    mainMenuItems: defaultMainMenuItems,
    headerComponent: PlAgColumnHeader,
    headerComponentParams: { type: 'Number' } satisfies PlAgHeaderComponentParams,
  },
  {
    colId: 'label',
    field: 'label',
    pinned: 'left',
    lockPinned: true,
    lockPosition: true,
    headerName: 'Sample label long text for overflow label long text for overflow',
    cellRenderer: 'PlAgTextAndButtonCell',
    headerComponent: PlAgColumnHeader,
    headerComponentParams: { type: 'Text' } satisfies PlAgHeaderComponentParams,
    cellRendererParams: {
      onClick: onClickHandler,
      invokeRowsOnDoubleClick: true,
    },
  },
  {
    colId: 'progress',
    field: 'progress',
    headerName: 'Progress',
    cellRendererSelector: (cellData) => {
      return {
        component: PlAgCellProgress,
        params: {
          progress: cellData.value,
          progressString: cellData.value,
          step: cellData.value === undefined ? 'Queued' : 'Loading',
          stage: cellData.value === undefined ? 'not_started' : 'running',
        },
      };
    },
    cellStyle: {
      '--ag-cell-horizontal-padding': '0px',
      '--ag-cell-vertical-padding': '0px',
    },
    headerComponent: PlAgColumnHeader,
    headerComponentParams: { type: 'Text' } satisfies PlAgHeaderComponentParams,
  },
  {
    colId: 'stacked_bar',
    headerName: 'StackedBar',
    cellRendererSelector: (_cellData) => {
      const value = Math.random() > 0.5
        ? stackedSettings.value
        : undefined;
      return {
        component: PlAgChartStackedBarCell,
        params: { value },
      };
    },
  },
  {
    colId: 'histogram',
    headerName: 'Histogram',
    cellRendererSelector: (_cellData) => {
      const value = Math.random() > 0.5
        ? histogramSettings.value
        : undefined;
      return {
        component: PlAgChartHistogramCell,
        params: { value },
      };
    },
  },
  {
    colId: 'date',
    field: 'date',
    headerName: 'Date',
    headerComponent: PlAgColumnHeader,
    headerComponentParams: { type: 'Date' } satisfies PlAgHeaderComponentParams,
  },
  {
    colId: 'file',
    field: 'file',
    headerName: 'File input',
    cellRenderer: 'PlAgCellFile',

    headerComponent: PlAgColumnHeader,
    headerComponentParams: { type: 'File' } satisfies PlAgHeaderComponentParams,
    cellStyle: { padding: 0 },
  },
  {
    colId: 'link',
    field: 'link',
    headerName: 'Link',
    headerComponent: PlAgColumnHeader,
    headerComponentParams: { type: 'Text' } satisfies PlAgHeaderComponentParams,
    cellRenderer: 'LinkComponent',
  },
  {
    colId: 'time',
    field: 'time',
    headerName: 'Duration',
    headerComponent: PlAgColumnHeader,
    headerComponentParams: { type: 'Duration' } satisfies PlAgHeaderComponentParams,
  },
];

const result = times(100, (i) => {
  return {
    id: faker.number.int(),
    label: faker.company.buzzNoun(),
    progress: i % 2 === 0 ? undefined : faker.number.int({ min: 24, max: 100 }),
    date: faker.date.birthdate(),
    file: '',
    link: faker.internet.url(),
    time: `${faker.number.int()} h`,
  };
});

function onClickHandler() {
  // will be invoked when invokeRowsOnDoubleClick: false
  console.log('onClickHandler');
}

const gridOptions: GridOptions = {
  onRowDoubleClicked: (e) => {
    console.log('Example "Open" button was clicked', e);
  },
  components: {
    PlAgCellProgress,
    LinkComponent,
    PlAgCellFile,
    PlAgTextAndButtonCell,
  },
};
const gridApi = ref<GridApi | null>(null);
const onGridReady = (e: GridReadyEvent) => {
  gridApi.value = e.api;
  autoSizeRowNumberColumn(e.api);
};
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>AgGridVue</template>
    <template #append>
      <PlAgDataTableToolsPanel>
        <PlAgGridColumnManager v-if="gridApi" :api="gridApi" />
        <PlAgCsvExporter v-if="gridApi" :api="gridApi" />
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
