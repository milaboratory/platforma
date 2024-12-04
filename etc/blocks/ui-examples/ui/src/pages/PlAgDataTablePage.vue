<script setup lang="ts">
import { platforma } from '@milaboratories/milaboratories.ui-examples.model';
import { computed, reactive } from 'vue';
import type { ListOption, PlDataTableSettings } from '@platforma-sdk/ui-vue';
import { PlBlockPage, PlAgDataTable, useWatchFetch, PlDropdown } from '@platforma-sdk/ui-vue';
import { useApp } from '../app';
import type { JoinEntry, PColumnIdAndSpec } from '@platforma-sdk/model';
import { deepClone } from '@milaboratories/helpers';

const app = useApp();

const data = reactive({
  options: [] as ListOption<PColumnIdAndSpec>[]
});

const pFrame = computed(() => app.model.outputs.pFrame);

useWatchFetch(pFrame, async () => {
  if (!pFrame.value) return [];
  const columns = await platforma.pFrameDriver.listColumns(pFrame.value);
  data.options = columns
    .filter(
      (idAndSpec) =>
        !(idAndSpec.spec.axesSpec.length === 1 && idAndSpec.spec.name === 'pl7.app/label')
    )
    .map((idAndSpec, i) => ({
      text:
        idAndSpec.spec.annotations?.['pl7.app/label']?.trim() ??
        'Unlabelled column ' + i.toString(),
      value: idAndSpec
    }))
    .sort((lhs, rhs) => lhs.text.localeCompare(rhs.text));
});

if (!app.model.ui?.dataTableState) {
  app.model.ui = {
    dataTableState: {
      settingsOpened: true,
      gridState: {},
      group: {
        mainColumn: undefined,
        additionalColumns: [],
        enrichmentColumns: [],
        possiblePartitioningAxes: [],
        join: undefined
      },
      partitioningAxes: [],
      tableState: {
        gridState: {},
        pTableParams: {
          sorting: [],
          filters: []
        }
      }
    }
  };
}

const tableSettings = computed<PlDataTableSettings>(() => ({
  sourceType: 'pframe',
  pFrame: app.model.outputs.pFrame,
  join: app.model.ui.dataTableState?.group.join,
  sheetAxes: app.model.ui.dataTableState?.partitioningAxes ?? [],
  pTable: app.model.outputs.pTable
}));

function makeJoin(
  mainColumn: PColumnIdAndSpec | undefined,
  additionalColumns: PColumnIdAndSpec[],
  enrichmentColumns: PColumnIdAndSpec[]
): JoinEntry<PColumnIdAndSpec> | undefined {
  if (!mainColumn) return undefined;
  return {
    type: 'outer',
    primary: {
      type: 'full',
      entries: [mainColumn, ...additionalColumns].map(
        (column) =>
          ({
            type: 'column',
            column: column
          }) as const
      )
    },
    secondary: enrichmentColumns.map((column) => ({
      type: 'column',
      column: column
    }))
  };
}

const mainColumn = computed({
  get() {
    return app.model.ui.dataTableState?.group.mainColumn;
  },
  set(column) {
    const dataTableState = app.model.ui.dataTableState!;

    dataTableState.group.mainColumn = column;

    const join = makeJoin(column, [], []);
    console.log('join', join);
    const possiblePartitioningAxes = column?.spec.axesSpec.map((it) => deepClone(it)) ?? [];

    dataTableState.group = {
      mainColumn: column,
      additionalColumns: [],
      enrichmentColumns: [],
      possiblePartitioningAxes,
      join
    };
  }
});

const tableState = computed({
  get() {
    return app.model.ui.dataTableState?.tableState ?? { gridState: {} };
  },
  set(v) {
    console.log('set state', v);
    app.model.ui.dataTableState!.tableState = v;
  }
});
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <template #title>PlAgDataTable</template>
    <template #append>
      <PlDropdown
        v-model="mainColumn"
        style="z-index: 100"
        label="Main column"
        :options="data.options"
        clearable
      />
    </template>
    <PlAgDataTable v-model="tableState" :settings="tableSettings" />
  </PlBlockPage>
</template>
