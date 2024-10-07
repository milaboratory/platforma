import { defineApp } from '@platforma-sdk/ui-vue';
import MainPage from './MainPage.vue';
import { platforma } from './model';

window.platforma = platforma;

export const sdkPlugin = defineApp(platforma, () => {
  return {
    routes: {
      '/': MainPage
    }
  };
});

export const useApp = sdkPlugin.useApp;
