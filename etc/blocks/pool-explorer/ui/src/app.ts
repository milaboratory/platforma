import { platforma } from "@milaboratories/milaboratories.pool-explorer.model";
import MainPage from "./MainPage.vue";
import TracesPage from "./TracesPage.vue";
import { defineAppV3 } from "@platforma-sdk/ui-vue";

export const sdkPlugin = defineAppV3(platforma, (_base) => {
  return {
    routes: {
      "/": () => MainPage,
      "/traces": () => TracesPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
