import { platforma } from "@milaboratories/milaboratories.test-block-table.model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import TableSplit from "./TableSplit.vue";
import Table from "./Table.vue";

export const sdkPlugin = defineAppV3(platforma, () => {
  return {
    routes: {
      "/": () => Table,
      "/split": () => TableSplit,
    },
  };
});

export const useApp = sdkPlugin.useApp;
