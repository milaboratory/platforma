import { platforma } from '@milaboratories/milaboratories.test-blob-url-custom-protocol.model';
import MainPage from './MainPage.vue';
import { defineApp } from '@platforma-sdk/ui-vue';
import { Component, computed, reactive } from 'vue';
import { Equal, Expect } from '@milaboratories/helpers';

export const sdkPlugin = defineApp(platforma, (base) => {
  // Additional data
  const data = reactive({
    counter: 0
  });

  function incrementCounter() {
    data.counter++;
  }

  const argsAsJson = computed(() => JSON.stringify(base.snapshot.args));

  return {
    data,
    argsAsJson,
    routes: {
      '/': () => MainPage
    }
  };
});

type App = ReturnType<typeof sdkPlugin.useApp>;

type __cases = [
  Expect<Equal<App['data'], { counter: number }>>,
  Expect<Equal<App['argsAsJson'], string>>,
];

export const useApp = sdkPlugin.useApp;
