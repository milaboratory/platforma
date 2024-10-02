import { platforma } from '@milaboratories/milaboratories.test-enter-numbers.model';
import { defineApp } from '@platforma-sdk/ui-vue';
import LogViewPage from './LogViewPage.vue';
import SlideModalPage from './SlideModalPage.vue';
import { computed, reactive } from 'vue';

export const sdkPlugin = defineApp(platforma, (base) => {
  // Additional data
  const data = reactive({
    counter: 0,
  });

  function incrementCounter() {
    data.counter++;
  }

  const argsAsJson = computed(() => JSON.stringify(base.args));

  return {
    data,
    incrementCounter,
    argsAsJson,
    routes: {
      '/': LogViewPage,
      '/slide-modal' : SlideModalPage, 
    }
  };
});

export const useApp = sdkPlugin.useApp;