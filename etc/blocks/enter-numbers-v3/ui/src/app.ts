import { platforma } from "@milaboratories/milaboratories.test-enter-numbers-v3.model";
import MainPage from "./MainPage.vue";
import { defineApp, ensureError } from "@platforma-sdk/ui-vue";
import type { Component } from "vue";
import { computed, reactive, ref } from "vue";
import type { Equal, Expect } from "@milaboratories/helpers";

export const sdkPlugin = defineApp(
  platforma,
  () => {
    // Additional data
    const data = reactive({
      counter: 0,
    });

    const error = ref<string | undefined>(undefined);

    function incrementCounter() {
      data.counter++;
    }

    const stateAsJson = computed(() => "not implemented");

    return {
      data,
      error,
      incrementCounter,
      stateAsJson,
      setError(e: unknown) {
        error.value = ensureError(e).message;
      },
      revert() {
        alert("revert: not implemented");
      },
      routes: {
        "/": () => MainPage,
      },
    };
  },
  {
    debug: true,
  },
);

type App = ReturnType<typeof sdkPlugin.useApp>;

type __cases = [
  Expect<Equal<App["incrementCounter"], () => void>>,
  Expect<Equal<App["data"], { counter: number }>>,
  Expect<Equal<App["stateAsJson"], string>>,
  Expect<Equal<App["getRoute"], (href: "/") => Component | undefined>>,
];

export const useApp = sdkPlugin.useApp;
