import { platforma } from '@milaboratories/milaboratories.test-enter-numbers.model';
import { defineApp } from '@platforma-sdk/ui-vue';
import LogViewPage from './LogViewPage.vue';
import ModalsPage from './ModalsPage.vue';
import { computed, reactive } from 'vue';
import InjectEnvPage from './InjectEnvPage.vue';
import PlDropdownPage from './PlDropdownPage.vue';

export const sdkPlugin = defineApp(platforma, (base) => {
  // Additional data
  const data = reactive({
    counter: 0
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
      '/modals': ModalsPage,
      '/inject-env': InjectEnvPage,
      '/pl-dropdown': PlDropdownPage
    }
  };
});

export const useApp = sdkPlugin.useApp;
