<script lang="ts" setup>
import type { PlProgressCellProps } from '@milaboratories/uikit';
import { PlProgressCell } from '@milaboratories/uikit';
import type { ICellRendererParams } from 'ag-grid-enterprise';

const props = defineProps<{ params: ICellRendererParams & PlProgressCellProps }>();
</script>

<template>
  <PlProgressCell v-bind="props.params"/>
</template>
