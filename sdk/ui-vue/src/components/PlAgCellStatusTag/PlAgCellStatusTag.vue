<script lang="ts" setup>
import type { ICellRendererParams } from "ag-grid-enterprise";
import { PlStatusTag } from "@milaboratories/uikit";
import type { PlStatusTagType } from "@milaboratories/uikit";

defineProps<{ params?: ICellRendererParams & { type: PlStatusTagType } }>();
</script>

<template>
  <div data-testid="pl-ag-cell-status-tag" class="pl-ag-cell-status-tag d-flex align-center">
    <PlStatusTag data-testid="pl-ag-cell-status-tag-tag" :type="params?.type" />
  </div>
</template>

<style lang="scss">
.pl-ag-cell-status-tag {
  height: 100%;
  padding: 0 12px;
}
</style>
