import { platforma } from '@milaboratories/milaboratories.test-sum-numbers-v3.model';
import MainPage from './MainPage.vue';
import { defineApp } from '@platforma-sdk/ui-vue';
import type { Component } from 'vue';
import { computed, reactive } from 'vue';
import type { Equal, Expect } from '@milaboratories/helpers';

export const sdkPlugin = defineApp(platforma, (base) => {
  // Additional data
  const data = reactive({
    counter: 0,
  });

  function incrementCounter() {
    data.counter++;
  }

  const dataAsJson = computed(() => JSON.stringify(base.snapshot.data));

  return {
    data,
    incrementCounter,
    dataAsJson,
    routes: {
      '/': () => MainPage,
    },
  };
});

type App = ReturnType<typeof sdkPlugin.useApp>;

type __cases = [
  Expect<Equal<App['incrementCounter'], () => void>>,
  Expect<Equal<App['data'], { counter: number }>>,
  Expect<Equal<App['dataAsJson'], string>>,
  Expect<Equal<App['getRoute'], (href: '/') => Component | undefined>>,
];

export const useApp = sdkPlugin.useApp;
