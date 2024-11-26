<script lang="ts" setup>
import type { ICellRendererParams } from '@ag-grid-community/core';
import type { MaskIconName16 } from '@platforma-sdk/ui-vue';
import { PlMaskIcon16 } from '@platforma-sdk/ui-vue';
import './pl-ag-text-and-button-cell.scss';

const props = defineProps<{
  params: ICellRendererParams & { plIcon?: MaskIconName16; plBtnLabel?: string };
}>();

function triggerRowDoubleClick() {
  const rowElement = document.querySelector(`.ag-row[row-index="${props.params.node.rowIndex}"]`);
  if (rowElement) {
    const dblClickEvent = new MouseEvent('dblclick', {
      bubbles: true,
      cancelable: true,
      view: window,
    });
    rowElement.dispatchEvent(dblClickEvent);
  } else {
    console.warn(`Row with index ${props.params.node.rowIndex} not found.`);
  }
}
</script>
<template>
  <div class="pl-ag-grid-open-cell d-flex">
    <div class="pl-ag-grid-open-cell__value">
      {{ params.value }}
    </div>
    <div class="pl-ag-grid-open-cell__activator text-caps11 align-center" @click.stop="triggerRowDoubleClick">
      <PlMaskIcon16 :name="params.plIcon ?? 'maximize'" />
      {{ params.plBtnLabel ?? 'Open' }}
    </div>
  </div>
</template>
