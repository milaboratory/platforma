import { platforma } from '@milaboratories/milaboratories.test-enter-numbers.model';
import { defineApp } from '@platforma-sdk/ui-vue';
import { computed, reactive } from 'vue';
import LogViewPage from './pages/LogViewPage.vue';
import ModalsPage from './pages/ModalsPage.vue';
import InjectEnvPage from './pages/InjectEnvPage.vue';
import DropdownsPage from './pages/DropdownsPage.vue';
import UseWatchFetchPage from './pages/UseWatchFetchPage.vue';
import FormComponentsPage from './pages/FormComponentsPage.vue';
import TypographyPage from './pages/TypographyPage.vue';

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
      '/dropdowns': DropdownsPage,
      '/use-watch-fetch': UseWatchFetchPage,
      '/form-components': FormComponentsPage,
      '/typography': TypographyPage
    }
  };
});

export const useApp = sdkPlugin.useApp;
