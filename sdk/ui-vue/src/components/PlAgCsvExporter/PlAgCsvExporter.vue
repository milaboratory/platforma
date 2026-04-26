<script setup lang="ts">
import type { GridApi } from "ag-grid-enterprise";
import type { PTableHandle } from "@platforma-sdk/model";
import { PlBtnGhost, usePlBlockPageTitleTeleportTarget } from "@milaboratories/uikit";
import { shallowRef, toRefs } from "vue";
import { isNil } from "es-toolkit";
import { exportCsv, isCsvExportAvailable } from "./export-csv";
import type { ExportOptions } from "./export-csv";

const props = defineProps<{
  api: GridApi;
  tableHandle?: PTableHandle;
}>();
const { api: gridApi } = toRefs(props);
const csvExportAvailable = isCsvExportAvailable();

const exporting = shallowRef(false);
const initiateExport = () => {
  const nativeOptions: ExportOptions | undefined = !isNil(props.tableHandle)
    ? { tableHandle: props.tableHandle, format: "csv" }
    : undefined;

  if (isNil(nativeOptions)) {
    return;
  }

  exporting.value = true;
  exportCsv(gridApi.value, nativeOptions).finally(() => (exporting.value = false));
};

const teleportTarget = usePlBlockPageTitleTeleportTarget("PlAgCsvExporter");
</script>

<template>
  <Teleport v-if="teleportTarget && csvExportAvailable" :to="teleportTarget">
    <PlBtnGhost :loading="exporting" icon="export" @click.stop="initiateExport">
      Export
    </PlBtnGhost>
  </Teleport>
</template>
