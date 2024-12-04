<script setup lang="ts">
import type { IHeaderParams, SortDirection } from '@ag-grid-community/core';
import type { MaskIconName16 } from '@milaboratories/uikit';
import { PlMaskIcon16 } from '@milaboratories/uikit';
import { computed, onMounted, ref } from 'vue';
import './pl-ag-column-header.scss';
import type { PlAgHeaderComponentParams } from './types';

const props = defineProps<{ params: IHeaderParams & PlAgHeaderComponentParams }>();

const icon = computed<MaskIconName16>(() => {
  const type = (props.params.column.getUserProvidedColDef()?.headerComponentParams as PlAgHeaderComponentParams)?.type;
  switch (type) {
    case undefined:
    case 'Text':
      return 'cell-type-txt';
    case 'Number':
      return 'cell-type-num';
    case 'File':
      return 'paper-clip';
    case 'Date':
      return 'calendar';
    case 'Duration':
      return 'time';
    default:
      throw Error(`unsupported data type: ${type satisfies never} for PlAgColumnHeader component. Column ${props.params.column.getColId()}`);
  }
});

const sortDirection = ref<SortDirection>(null);
const refreshSortDirection = () => (sortDirection.value = props.params.column.getSort() ?? null);
onMounted(() => refreshSortDirection());
function onSortRequested() {
  if (props.params.column.isSortable()) {
    props.params.progressSort();
    refreshSortDirection();
  }
}
const sortIcon = computed<MaskIconName16 | null>(() => {
  const direction = sortDirection.value;
  switch (direction) {
    case 'asc':
      return 'arrow-up';
    case 'desc':
      return 'arrow-down';
    case null:
      return null;
    default:
      throw Error(`unsupported sort direction: ${direction satisfies never}. Column ${props.params.column.getColId()}`);
  }
});

const menuActivatorBtn = ref<HTMLElement>();
function showMenu() {
  const menuActivatorBtnValue = menuActivatorBtn.value;
  if (menuActivatorBtnValue) props.params.showColumnMenu(menuActivatorBtnValue);
}
</script>

<template>
  <div class="pl-ag-column-header d-flex align-center gap-6" @click="onSortRequested">
    <div class="pl-ag-column-header__title d-flex align-center gap-6 flex-grow-1">
      <PlMaskIcon16 :name="icon" class="pl-ag-column-header__type-icon" />
      <span>{{ params.displayName }}</span>
      <PlMaskIcon16 v-if="sortIcon" :name="sortIcon" />
    </div>
    <div v-if="params.enableMenu" ref="menuActivatorBtn" class="pl-ag-column-header__menu-icon" @click.stop="showMenu">
      <PlMaskIcon16 name="more" />
    </div>
  </div>
</template>
