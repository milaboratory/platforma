import { defineApp } from '@platforma-sdk/ui-vue';
import MainPage from './MainPage.vue';
import { platforma } from './model';
import FormPage from './FormPage.vue';
import ValueOrErrorPage from './ValueOrErrorPage.vue';
import OutputsBasicsPage from './OutputsBasicsPage.vue';

window.platforma = platforma;

export const sdkPlugin = defineApp(platforma, () => {
  return {
    routes: {
      '/': MainPage,
      '/outputs-basics': OutputsBasicsPage,
      '/form': FormPage,
      '/value-or-error-page': ValueOrErrorPage
    }
  };
});

export const useApp = sdkPlugin.useApp;
