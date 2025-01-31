<script setup lang="ts">
import type { GridApi } from 'ag-grid-enterprise';
import { PlBtnGhost, PlMaskIcon24 } from '@milaboratories/uikit';
import { shallowRef, toRefs } from 'vue';
import { exportCsv } from './export-csv';
import { useDataTableToolsPanelTarget } from '../PlAgDataTableToolsPanel';

const props = defineProps<{
  api: GridApi;
}>();
const { api: gridApi } = toRefs(props);

const exporting = shallowRef(false);
const initiateExport = () => {
  exporting.value = true;
  exportCsv(gridApi.value, () => exporting.value = false);
};

const teleportTarget = useDataTableToolsPanelTarget();
</script>

<template>
  <div>
    <Teleport v-if="teleportTarget" :to="teleportTarget">
      <PlBtnGhost :loading="exporting" @click.stop="initiateExport">
        Export
        <template #append>
          <PlMaskIcon24 name="export" />
        </template>
      </PlBtnGhost>
    </Teleport>
  </div>
</template>
