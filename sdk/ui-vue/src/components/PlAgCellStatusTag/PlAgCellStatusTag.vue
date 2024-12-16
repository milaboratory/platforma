<script lang="ts" setup>
import type { ICellRendererParams } from 'ag-grid-enterprise';
import { PlStatusTag } from '@milaboratories/uikit';
import type { PlStatusTagType } from '@milaboratories/uikit';

defineProps<{ params?: ICellRendererParams & { type: PlStatusTagType } }>();
</script>

<template>
  <div class="pl-ag-cell-status-tag d-flex align-center">
    <PlStatusTag :type="params?.type"/>
  </div>
</template>

<style lang="scss">
.pl-ag-cell-status-tag{
  height: 100%;
  padding: 0 12px;
}
</style>
