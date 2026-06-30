import { platforma } from "@milaboratories/milaboratories.test-nonpure-output.model";
import MainPage from "./MainPage.vue";
import { defineApp } from "@platforma-sdk/ui-vue";
import type { Component } from "vue";
import type { Equal, Expect } from "@milaboratories/helpers";

export const sdkPlugin = defineApp(platforma, () => {
  return {
    routes: {
      "/": () => MainPage,
    },
  };
});

type App = ReturnType<typeof sdkPlugin.useApp>;

type __cases = [Expect<Equal<App["getRoute"], (href: "/") => Component | undefined>>];

export const useApp = sdkPlugin.useApp;
