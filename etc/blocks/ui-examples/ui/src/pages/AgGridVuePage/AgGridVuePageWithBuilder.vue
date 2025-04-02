<script setup lang="ts">
import type { Component } from 'vue';
import { computed, h, ref } from 'vue';
import {
  PlBlockPage,
  PlAgDataTableToolsPanel,
  PlAgGridColumnManager,
  PlAgCsvExporter,
  defaultMainMenuItems,
  PlAgChartStackedBarCell,
  PlAgChartHistogramCell,
  PlCheckbox,
  PlRow,
  useAgGridOptions,
  makeEaseOut,
  animate,
  PlBtnPrimary,
} from '@platforma-sdk/ui-vue';
import { AgGridVue } from 'ag-grid-vue3';
import { times } from '@milaboratories/helpers';
import { faker } from '@faker-js/faker';
import { stackedSettings } from './stackedSettings';
import { histogramSettings } from './histogramSettings';
import { LinkComponent } from './LinkComponent';
import type { ImportFileHandle, ImportProgress } from '@platforma-sdk/model';
import { useApp } from '../../app';

type FileCell = {
  importFileHandle: ImportFileHandle | undefined;
  importProgress: ImportProgress | undefined;
};

type Row = {
  id: number;
  label: string;
  progress: number | undefined;
  stacked_bar: unknown;
  date: Date;
  file: FileCell;
  link: string;
  time: string;
};

const app = useApp();

function generateData(): Row[] {
  return times(10, (i) => {
    const importFileHandle = app.model.args.handles[i];
    const importProgress = importFileHandle ? app.model.outputs?.progresses?.[importFileHandle] : undefined;
    return {
      id: i,
      label: faker.company.buzzNoun(),
      progress: faker.number.int({ min: 24, max: 100 }),
      stacked_bar: (i % 2 === 0) ? stackedSettings.value : undefined,
      date: faker.date.birthdate(),
      file: {
        importFileHandle,
        importProgress,
      },
      link: faker.internet.url(),
      time: `${faker.number.int()} h`,
    };
  });
}

const result = computed(() => generateData());

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

const isOverlayTransparent = ref(false);

const rowNumbers = ref(true);

const loading = ref(false);

const notReady = ref(false);

const hasRows = ref(true);

const { gridOptions, gridApi } = useAgGridOptions<Row>(({ builder }) => {
  return builder
    .setComponents({
      LinkComponent,
    })
    .setOption('onRowDoubleClicked', (_e) => {
      alert('Example "Open" button was clicked');
    })
    .setRowSelection({
      mode: 'multiRow',
      checkboxes: false,
      headerCheckbox: false,
    })
    .setLoading(loading.value)
    .setNotReady(notReady.value)
    .setNotReadyText('Not ready text (custom, default is "Not ready"')
    .setRowData(hasRows.value ? result.value : [])
    .setNoRowsText('No rows text (custom, default is "Empty")')
    .setLoadingOverlayType(isOverlayTransparent.value ? 'transparent' : undefined)
    .columnRowNumbers(rowNumbers.value)
    .column({
      field: 'id',
      headerName: 'ID',
      mainMenuItems: defaultMainMenuItems,
      headerComponentParams: { type: 'Number' },
    })
    .column({
      field: 'label',
      pinned: 'left',
      lockPinned: true,
      lockPosition: true,
      headerName: 'Sample label long text for overflow label long text for overflow',
      headerComponentParams: { type: 'Text' },
      textWithButton: true,
    })
    .column<number | undefined>({
      field: 'progress',
      headerName: 'Progress',
      progress(value, cellData) {
        const percent = value ?? 0;

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
      headerComponentParams: { type: 'Progress' },
    })
    .columnFileInput<FileCell>({
      field: 'file',
      headerName: 'File input',
      extensions: ['fastq.gz'],
      setImportFileHandle: (params) => {
        app.model.args.handles[params.data.id] = params.newValue ?? undefined;
      },
      resolveImportProgress: (cellData) => {
        return cellData.value?.importProgress;
      },
      resolveImportFileHandle: (cellData) => {
        return cellData.value?.importFileHandle;
      },
    })
    .column({
      field: 'stacked_bar',
      headerName: 'StackedBar',
      progress: (value) => {
        if (value) {
          return undefined; // If no progress show main component
        }

        return {
          status: 'running',
          text: 'Loading data...',
        };
      },
      cellRendererSelector: (cellData) => {
        return {
          component: PlAgChartStackedBarCell,
          params: { value: cellData.value },
        };
      },
    })
    .column({
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
    })
    .column({
      field: 'date',
      headerName: 'Date',
      headerComponentParams: { type: 'Date' },
    })
    .column({
      field: 'link',
      headerName: 'Link',
      headerComponentParams: { type: 'Text' },
      cellRenderer: 'LinkComponent',
    })
    .column({
      field: 'time',
      headerName: 'Duration',
      headerComponentParams: { type: 'Duration' },
    });
  ;
});
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>AgGridVue</template>
    <template #append>
      <PlBtnPrimary @click="showProgress">Show progress</PlBtnPrimary>
      <PlAgDataTableToolsPanel>
        <PlAgGridColumnManager v-if="gridApi" :api="gridApi" />
        <PlAgCsvExporter v-if="gridApi" :api="gridApi" />
      </PlAgDataTableToolsPanel>
    </template>

    <PlRow wrap>
      <PlCheckbox v-model="rowNumbers">Show row numbers</PlCheckbox>
      <PlCheckbox v-model="isOverlayTransparent">Use transparent overlay</PlCheckbox>
      <PlCheckbox v-model="loading">Loading</PlCheckbox>
      <PlCheckbox v-model="notReady">Not Ready</PlCheckbox>
      <PlCheckbox v-model="hasRows">Has rows</PlCheckbox>
    </PlRow>

    <AgGridVue
      :style="{ height: '100%' }"
      v-bind="gridOptions"
    />
  </PlBlockPage>
</template>
