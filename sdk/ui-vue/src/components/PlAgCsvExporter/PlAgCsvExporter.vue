<script setup lang="ts">
import type { GridApi } from 'ag-grid-enterprise';
import { PlBtnGhost, usePlBlockPageTitleTeleportTarget } from '@milaboratories/uikit';
import { shallowRef, toRefs } from 'vue';
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

const teleportTarget = usePlBlockPageTitleTeleportTarget('PlAgCsvExporter');
</script>

<template>
  <div>
    <Teleport v-if="teleportTarget" :to="teleportTarget">
      <PlBtnGhost :loading="exporting" icon="export" @click.stop="initiateExport">
        Export
      </PlBtnGhost>
    </Teleport>
  </div>
</template>
