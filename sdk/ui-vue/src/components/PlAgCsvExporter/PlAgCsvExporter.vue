<script setup lang="ts">
import type { GridApi } from '@ag-grid-community/core';
import { PlBtnGhost, PlMaskIcon24 } from '@milaboratories/uikit';
import { shallowRef, toRefs } from 'vue';
import { PlAgDataTableToolsPanelId } from '../PlAgDataTableToolsPanel/PlAgDataTableToolsPanelId';
import { exportCsv } from './export-csv';

const props = defineProps<{
  api: GridApi;
}>();
const { api: gridApi } = toRefs(props);

const exporting = shallowRef(false);
const initiateExport = () => {
  exporting.value = true;
  exportCsv(gridApi.value, () => exporting.value = false);
};
</script>

<template>
  <div>
    <Teleport :to="`#${PlAgDataTableToolsPanelId}`">
      <PlBtnGhost :loading="exporting" @click.stop="initiateExport">
        Export
        <template #append>
          <PlMaskIcon24 name="export" />
        </template>
      </PlBtnGhost>
    </Teleport>
  </div>
</template>
