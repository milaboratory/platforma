import { platforma } from "@milaboratories/milaboratories.test-block-table.model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import TableV2 from "./TableV2.vue";
import TableV3 from "./TableV3.vue";

export const sdkPlugin = defineAppV3(platforma, () => {
  return {
    routes: {
      "/": () => TableV3,
      "/v2": () => TableV2,
    },
  };
});

export const useApp = sdkPlugin.useApp;
