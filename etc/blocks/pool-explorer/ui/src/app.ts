import { platforma } from '@milaboratories/milaboratories.pool-explorer.model';
import MainPage from './MainPage.vue';
import { defineApp } from '@platforma-sdk/ui-vue';

export const sdkPlugin = defineApp(platforma, (_base) => {
  return {
    routes: {
      '/': () => MainPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
