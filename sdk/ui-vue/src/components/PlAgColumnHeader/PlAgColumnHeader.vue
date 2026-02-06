<script setup lang="ts">
import type { IHeaderParams, SortDirection } from "ag-grid-enterprise";
import type { MaskIconName16 } from "@milaboratories/uikit";
import { PlMaskIcon16, PlTooltip } from "@milaboratories/uikit";
import { computed, onMounted, ref } from "vue";
import "./pl-ag-column-header.scss";
import type { PlAgHeaderComponentParams } from "./types";

const { params } = defineProps<{ params: IHeaderParams & PlAgHeaderComponentParams }>();

const icon = computed<MaskIconName16>(() => {
  switch (params.type) {
    case undefined:
    case "Text":
      return "cell-type-txt";
    case "Number":
      return "cell-type-num";
    case "File":
      return "paper-clip";
    case "Date":
      return "calendar";
    case "Duration":
      return "time";
    case "Progress":
      return "progress";
    default:
      throw Error(
        `unsupported data type: ${params.type satisfies never} for PlAgColumnHeader component. Column ${params.column.getColId()}`,
      );
  }
});

const sortDirection = ref<SortDirection>(null);
const refreshSortDirection = () => (sortDirection.value = params.column.getSort() ?? null);
onMounted(() => refreshSortDirection());
function onSortRequested() {
  if (params.column.isSortable()) {
    params.progressSort();
    refreshSortDirection();
  }
}
const sortIcon = computed<MaskIconName16 | null>(() => {
  const direction = sortDirection.value;
  switch (direction) {
    case "asc":
      return "arrow-up";
    case "desc":
      return "arrow-down";
    case null:
      return null;
    default:
      throw Error(
        `unsupported sort direction: ${direction satisfies never}. Column ${params.column.getColId()}`,
      );
  }
});

const menuActivatorBtn = ref<HTMLElement>();
function showMenu() {
  const menuActivatorBtnValue = menuActivatorBtn.value;
  if (menuActivatorBtnValue) params.showColumnMenu(menuActivatorBtnValue);
}
</script>

<template>
  <div class="pl-ag-column-header d-flex align-center gap-6" @click="onSortRequested">
    <PlTooltip>
      <template v-if="params.tooltip" #tooltip>{{ params.tooltip }}</template>
      <div class="pl-ag-column-header__title d-flex align-center gap-6 flex-grow-1">
        <PlMaskIcon16 :name="icon" class="pl-ag-column-header__type-icon" />
        <span>{{ params.displayName }}</span>
        <PlMaskIcon16 v-if="sortIcon" :name="sortIcon" />
      </div>
    </PlTooltip>
    <div
      v-if="params.enableMenu"
      ref="menuActivatorBtn"
      class="pl-ag-column-header__menu-icon"
      @click.stop="showMenu"
    >
      <PlMaskIcon16 name="more" />
    </div>
  </div>
</template>
