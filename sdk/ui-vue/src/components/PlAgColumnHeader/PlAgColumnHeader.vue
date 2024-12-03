<script setup lang="ts">
import type { IHeaderParams, SortDirection } from '@ag-grid-community/core';
import type { MaskIconName16 } from '@milaboratories/uikit';
import { PlMaskIcon16 } from '@milaboratories/uikit';
import type { ValueType } from '@platforma-sdk/model';
import { computed, ref } from 'vue';
import './pl-ag-column-header.scss';
import { nextTick } from 'vue';

type PlAgHeaderComponentParams = { type?: ValueType | 'File' | 'Date' | 'Duration' };
type AllowedIcons = Extract<MaskIconName16, 'cell-type-txt' | 'cell-type-num' | 'paper-clip' | 'calendar' | 'time'>;
type SortIcons = Extract<MaskIconName16, 'arrow-up' | 'arrow-down'>;

const props = defineProps<{ params: IHeaderParams & PlAgHeaderComponentParams }>();
const sortDirection = ref<SortDirection>(null);
const menuActivatorBtn = ref<HTMLElement>();

const headerComponentParams = computed<PlAgHeaderComponentParams | undefined>(
  () => props.params.column.getUserProvidedColDef()?.headerComponentParams,
);

const sortIcon = computed<SortIcons | null>(() =>
  sortDirection.value === 'asc' ? 'arrow-up' : sortDirection.value === 'desc' ? 'arrow-down' : null,
);
const icon = computed<AllowedIcons>(() => {
  const type = headerComponentParams.value?.type;
  switch (type ?? 'String') {
    case 'Int':
    case 'Long':
    case 'Float':
    case 'Double':
      return 'cell-type-num';
    case 'String':
    case 'Bytes':
      return 'cell-type-txt';
    case 'File':
      return 'paper-clip';
    case 'Date':
      return 'calendar';
    case 'Duration':
      return 'time';
    default:
      throw Error(`unsupported data type: ${type} for PlAgColumnHeader component. Column ${props.params.column.getColId()}`);
  }
});

function onSortRequested() {
  if (!props.params.column.isSortable()) {
    return;
  }

  props.params.progressSort();

  nextTick(() => {
    sortDirection.value = props.params.column.getSort() ?? null;
  });
}

function shwoMenu() {
  if (menuActivatorBtn.value) {
    console.log(menuActivatorBtn.value, 'menuActivatorBtn.value');
    props.params.showColumnMenu(menuActivatorBtn.value);
  }
}

console.log(props.params);
</script>

<template>
  <div class="pl-ag-column-header d-flex align-center gap-6" @click="onSortRequested">
    <div class="pl-ag-column-header__title d-flex align-center gap-6 flex-grow-1">
      <PlMaskIcon16 :name="icon" class="pl-ag-column-header__type-icon" />
      <span>{{ params.displayName }}</span>
      <PlMaskIcon16 v-if="sortIcon" :name="sortIcon" />
    </div>
    <div v-if="params.enableMenu" ref="menuActivatorBtn" class="pl-ag-column-header__menu-icon" @click.stop="shwoMenu">
      <PlMaskIcon16 name="more" />
    </div>
  </div>
</template>
