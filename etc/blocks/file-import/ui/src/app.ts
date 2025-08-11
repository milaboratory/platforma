import { platforma } from '@milaboratories/milaboratories.file-import-block.model';
import { defineApp } from '@platforma-sdk/ui-vue';
import MainPage from './MainPage.vue';

export const sdkPlugin = defineApp(platforma, (_base) => {
  return {
    routes: {
      '/': () => MainPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
