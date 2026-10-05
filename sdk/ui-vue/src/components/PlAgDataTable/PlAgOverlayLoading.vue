<script setup lang="ts">
import { PL_PLACEHOLDER_TEXTS, PlPlaceholder } from "@milaboratories/uikit";
import type { PlPlaceholderProps } from "@milaboratories/uikit";
import { ref } from "vue";
import style from "./pl-ag-overlay-loading.module.scss";
import type { PlAgOverlayLoadingParams } from "./types";

// @TODO move this component from this folder

const props = defineProps<{
  /** Required object that contains props from loadingOverlayComponentParams. */
  params: PlAgOverlayLoadingParams;
}>();

const params = ref(props.params);

defineExpose({
  refresh: (newParams: PlAgOverlayLoadingParams) => {
    params.value = newParams;
  },
});

function normalizePlaceholderText(
  text: string | Pick<PlPlaceholderProps, "title" | "subtitle">,
): Pick<PlPlaceholderProps, "title" | "subtitle"> {
  if (typeof text === "string") return { title: text };
  return text;
}
</script>

<template>
  <div data-testid="pl-ag-data-table-loading" :class="style.container">
    <div
      v-if="params.variant === 'not-ready'"
      data-testid="pl-ag-data-table-not-ready"
      :class="style.notReadyWrapper"
    >
      <div :class="style.iconCatInBag" />
      <h3 data-testid="pl-ag-data-table-not-ready-text" :class="style.text">
        {{ params.notReadyText || "Data is not computed" }}
      </h3>
    </div>
    <PlPlaceholder
      v-else
      data-testid="pl-ag-data-table-loading-placeholder"
      v-bind="
        normalizePlaceholderText(
          {
            loading: params.loadingText ?? PL_PLACEHOLDER_TEXTS.LOADING,
            running: params.runningText ?? PL_PLACEHOLDER_TEXTS.RUNNING,
          }[params.variant],
        )
      "
      variant="table"
    />
  </div>
</template>
