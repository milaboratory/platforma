import type { Equal, Expect } from "@milaboratories/helpers";
import { platforma } from "@milaboratories/milaboratories.test-blob-url-custom-protocol.model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import { computed, reactive } from "vue";
import MainPage from "./MainPage.vue";

export const sdkPlugin = defineAppV3(platforma, (base) => {
  // Additional data
  const data = reactive({
    counter: 0,
  });

  const dataAsJson = computed(() => JSON.stringify(base.snapshot.blockStorage));

  return {
    data,
    dataAsJson,
    routes: {
      "/": () => MainPage,
    },
  };
});

type App = ReturnType<typeof sdkPlugin.useApp>;

type __cases = [
  Expect<Equal<App["data"], { counter: number }>>,
  Expect<Equal<App["dataAsJson"], string>>,
];

export const useApp = sdkPlugin.useApp;
