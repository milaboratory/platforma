import { platforma } from '@milaboratories/milaboratories.test-enter-numbers.model';
import { defineApp } from '@platforma-sdk/ui-vue';
import LogViewPage from './LogViewPage.vue';
import SlideModalPage from './SlideModalPage.vue';
import { computed, reactive } from 'vue';
import InjectEnvPage from './InjectEnvPage.vue';

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
      '/inject-env': InjectEnvPage 
    }
  };
});

export const useApp = sdkPlugin.useApp;