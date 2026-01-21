import { platforma } from '@milaboratories/milaboratories.test-enter-numbers.model';
import MainPage from './MainPage.vue';
import { defineApp } from '@platforma-sdk/ui-vue';
import type { Component } from 'vue';
import { computed, reactive, ref } from 'vue';
import type { Equal, Expect } from '@milaboratories/helpers';
import { ensureError } from '@platforma-sdk/ui-vue';

export const sdkPlugin = defineApp(platforma, (base) => {
  // Additional data
  const data = reactive({
    counter: 0,
  });

  const error = ref<string | undefined>(undefined);

  function incrementCounter() {
    data.counter++;
  }

  const argsAsJson = computed(() => JSON.stringify(base.snapshot.args));

  return {
    data,
    incrementCounter,
    argsAsJson,
    setError(e: unknown) {
      error.value = ensureError(e).message;
    },
    routes: {
      '/': () => MainPage,
    },
  };
}, {
  debug: true,
});

type App = ReturnType<typeof sdkPlugin.useApp>;

type __cases = [
  Expect<Equal<App['incrementCounter'], () => void>>,
  Expect<Equal<App['data'], { counter: number }>>,
  Expect<Equal<App['argsAsJson'], string>>,
  Expect<Equal<App['getRoute'], (href: '/') => Component | undefined>>,
];

export const useApp = sdkPlugin.useApp;
