<script setup lang="ts">
import type { Component } from 'vue';
import { computed, h, ref } from 'vue';
import {
  PlBlockPage,
  PlAgDataTableToolsPanel,
  PlAgGridColumnManager,
  makeRowNumberColDef,
  PlAgCellFile,
  PlAgTextAndButtonCell,
  PlAgColumnHeader,
  type PlAgHeaderComponentParams,
  PlAgCsvExporter,
  PlAgCellProgress,
  defaultMainMenuItems,
  PlAgChartStackedBarCell,
  PlAgChartHistogramCell,
  PlCheckbox,
  PlRow,
  useAgGridOptionsSimple,
  makeEaseOut,
  animate,
  PlBtnPrimary,
  createAgGridColDef,
} from '@platforma-sdk/ui-vue';
import { AgGridVue } from 'ag-grid-vue3';
import type { ColDef } from 'ag-grid-enterprise';
import { times } from '@milaboratories/helpers';
import { faker } from '@faker-js/faker';
import { stackedSettings } from './stackedSettings';
import { histogramSettings } from './histogramSettings';
import { LinkComponent } from './LinkComponent';

type Row = {
  id: number;
  label: string;
  progress: number | undefined;
  stacked_bar: unknown;
  date: Date;
  file: string;
  link: string;
  time: string;
};

function generateData(): Row[] {
  return times(10, (i) => {
    return {
      id: i,
      label: faker.company.buzzNoun(),
      progress: faker.number.int({ min: 24, max: 100 }),
      stacked_bar: (i % 2 === 0) ? stackedSettings.value : undefined,
      date: faker.date.birthdate(),
      file: '',
      link: faker.internet.url(),
      time: `${faker.number.int()} h`,
    };
  });
}

const result = ref(generateData());

function showProgress() {
  animate({
    duration: 10000,
    timing: makeEaseOut((t) => t),
    draw: (progress) => {
      result.value.forEach((it) => {
        it.progress = progress * 100;
      });
    },
  });
}

const BlankComponent: Component = {
  props: ['params'],
  setup(props) {
    return () =>
      h('div', { style: `padding: 0 15px` }, props.params.value);
  },
};

const columnDefs = computed<ColDef<Row>[]>(() => {
  return [
    makeRowNumberColDef(),
    createAgGridColDef<Row>({
      colId: 'id',
      field: 'id',
      headerName: 'ID',
      mainMenuItems: defaultMainMenuItems,
      headerComponent: PlAgColumnHeader,
      headerComponentParams: { type: 'Number' } satisfies PlAgHeaderComponentParams,
    }),
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
    createAgGridColDef(({
      colId: 'progress',
      field: 'progress',
      headerName: 'Progress',
      progress: (cellData) => {
        const percent = cellData.data?.progress ?? 0;

        if (cellData.data?.id === 2) {
          return {
            status: 'not_started',
            error: 'Test Error',
          };
        }

        if (cellData.data?.id === 3) {
          return {
            status: 'running',
            text: 'Infinite progress',
          };
        }

        if (percent < 10) {
          return {
            status: 'not_started',
          };
        }

        if (percent >= 100) {
          return undefined;
        }

        if (percent > 90) {
          return {
            status: 'done',
          };
        }

        return {
          status: 'running',
          percent,
          text: `Progress`,
          suffix: `${percent.toFixed(1)}%`,
        };
      },
      cellRendererSelector: (cellData) => {
        return {
          component: BlankComponent,
          params: { value: cellData.value },
        };
      },
      headerComponent: PlAgColumnHeader,
      headerComponentParams: { type: 'Text' } satisfies PlAgHeaderComponentParams,
    })),
    createAgGridColDef<Row>(({
      colId: 'stacked_bar',
      field: 'stacked_bar',
      headerName: 'StackedBar',
      progress: (cellData) => {
        if (cellData.value) {
          return undefined;
        }

        return {
          status: 'running',
          text: 'Loading data...',
        };
      },
      cellRendererSelector: (cellData) => {
        console.log('cellData.value', cellData.value);
        return {
          component: PlAgChartStackedBarCell,
          params: { value: cellData.value },
        };
      },
    })),
    {
      colId: 'histogram',
      headerName: 'Histogram',
      cellRendererSelector: (cellData) => {
        const value = (cellData.data?.id ?? 0 % 2 === 0)
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
});

function onClickHandler() {
  // will be invoked when invokeRowsOnDoubleClick: false
  console.log('onClickHandler');
}

const isOverlayTransparent = ref(false);

const loading = ref(false);

const notReady = ref(false);

const hasRows = ref(true);

const { gridOptions, gridApi } = useAgGridOptionsSimple<Row>(() => {
  return {
    columnDefs: columnDefs.value,
    rowSelection: {
      mode: 'multiRow' as const,
      checkboxes: false,
      headerCheckbox: false,
    },
    loading: loading.value,
    rowData: hasRows.value ? result.value : [],
    onRowDoubleClicked: (e) => {
      console.log('Example "Open" button was clicked', e);
    },
    loadingOverlayComponentParams: {
      notReady: notReady.value,
      overlayType: isOverlayTransparent.value ? 'transparent' : undefined,
    },
    components: {
      PlAgCellProgress,
      LinkComponent,
      PlAgCellFile,
      PlAgTextAndButtonCell,
    },
  };
});
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>AgGridVue</template>
    <template #append>
      <PlRow>
        <PlCheckbox v-model="isOverlayTransparent">Use transparent overlay</PlCheckbox>
        <PlCheckbox v-model="loading">Loading</PlCheckbox>
        <PlCheckbox v-model="notReady">Not Ready</PlCheckbox>
        <PlCheckbox v-model="hasRows">Has rows</PlCheckbox>
        <PlBtnPrimary @click="showProgress">Show progress</PlBtnPrimary>
      </PlRow>
      <PlAgDataTableToolsPanel>
        <PlAgGridColumnManager v-if="gridApi" :api="gridApi" />
        <PlAgCsvExporter v-if="gridApi" :api="gridApi" />
      </PlAgDataTableToolsPanel>
    </template>

    <pre v-if="false">{{ result }}</pre>

    <AgGridVue
      :style="{ height: '100%' }"
      v-bind="gridOptions"
    />
  </PlBlockPage>
</template>
