import { platforma } from '@milaboratories/milaboratories.test-read-logs.model';
import MainPage from './MainPage.vue';
import { defineApp } from '@platforma-sdk/ui-vue';
import type { Component } from 'vue';
import { computed } from 'vue';
import type { Equal, Expect } from '@milaboratories/helpers';

export const sdkPlugin = defineApp(platforma, (base) => {
  const argsAsJson = computed(() => JSON.stringify(base.snapshot.args));

  return {
    argsAsJson,
    routes: {
      '/': () => MainPage,
    },
  };
});

type App = ReturnType<typeof sdkPlugin.useApp>;

type __cases = [
  Expect<Equal<App['argsAsJson'], string>>,
  Expect<Equal<App['getRoute'], (href: '/') => Component | undefined>>,
];

export const useApp = sdkPlugin.useApp;
