import { defineApp } from '@platforma-sdk/ui-vue';
import MainPage from './MainPage.vue';
import { platforma } from './model';
import { reactive } from 'vue';

window.platforma = platforma;

export const appSettings = reactive({
  deepPatchModel: true,
  debug: true,
});

export const sdkPlugin = defineApp(platforma, () => {
  return {
    routes: {
      '/': MainPage,
    },
  };
}, appSettings);

export const useApp = sdkPlugin.useApp;
