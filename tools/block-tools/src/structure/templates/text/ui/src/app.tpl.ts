import { platforma } from "${modelPkg}";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import MainPage from "./MainPage.vue";

export const sdkPlugin = defineAppV3(platforma, () => ({
  routes: {
    "/": () => MainPage,
  },
}));

export const useApp = sdkPlugin.useApp;
