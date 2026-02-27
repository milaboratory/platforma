import { platforma } from "@milaboratories/milaboratories.test-block-table.model";
import MainPage from "./MainPage.vue";
import { defineAppV3 } from "@platforma-sdk/ui-vue";

export const sdkPlugin = defineAppV3(platforma, () => {
  return {
    routes: {
      "/": () => MainPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
