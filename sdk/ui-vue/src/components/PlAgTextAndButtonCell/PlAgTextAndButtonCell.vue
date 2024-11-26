<script lang="ts" setup>
import type { ICellRendererParams, RowDoubleClickedEvent } from '@ag-grid-community/core';
import type { MaskIconName16 } from '@milaboratories/uikit';
import { PlMaskIcon16 } from '@milaboratories/uikit';
import './pl-ag-text-and-button-cell.scss';

const props = defineProps<{
  params: ICellRendererParams & {
    /**
     * Button icon MaskIconName16
     */
    icon?: MaskIconName16;
    /**
     * Button label
     */
    btnLabel?: string;
    /**
     * If invokeRowsOnDoubleClick = true, clicking a button inside the row
     * triggers the doubleClick event for the entire row. In this case,
     * the handler passed to the component is not called, even if it is defined.
     *
     * If invokeRowsOnDoubleClick = false, the doubleClick event for the row
     * is not triggered, but the provided handler will be called, receiving
     * the ICellRendererParams as an argument.
     */
    invokeRowsOnDoubleClick?: boolean;
    /**
     * plHandler parameter is a click handler that is invoked when
     * the invokeRowsOnDoubleClick property is set to false.
     */
    onClick?: (params: ICellRendererParams) => void;
  };
}>();

console.log(props);

function triggerRowDoubleClick() {
  if (props.params.invokeRowsOnDoubleClick) {
    const gridApi = props.params.api;

    const event: RowDoubleClickedEvent = {
      rowPinned: props.params.node.rowPinned,
      api: gridApi,
      rowIndex: props.params.node.rowIndex,
      context: gridApi,
      type: 'rowDoubleClicked',
      node: props.params.node,
      data: props.params.data,
      event: null,
    };

    gridApi.dispatchEvent(event);
  } else {
    props.params.onClick && props.params.onClick(props.params);
  }
}
</script>
<template>
  <div class="pl-ag-grid-open-cell d-flex">
    <div class="pl-ag-grid-open-cell__value">
      {{ params.value }}
    </div>
    <div class="pl-ag-grid-open-cell__activator text-caps11 align-center" @click.stop="triggerRowDoubleClick">
      <PlMaskIcon16 :name="params.icon ?? 'maximize'" />
      {{ params.btnLabel ?? 'Open' }}
    </div>
  </div>
</template>
